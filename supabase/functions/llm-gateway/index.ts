import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "jsr:@supabase/supabase-js@2";
import { createProvider, OpenAIProviderError } from "./providers.ts";
import { THEMES, getEligibleThemes, pickThemeDuel, getThemeByTags } from "../_shared/theme-engine.ts";
import { buildDrillDownState, type DrillDownNode } from "../_shared/drill-down-state.ts";
import { getDrillDownSystemPrompt, buildDrillDownMessages, buildOutdoorDichotomyMessages, describeContextV3, LANGUAGE_INSTRUCTIONS } from "../_shared/system-prompts-v3.ts";
import { GooglePlacesAdapter } from "../_shared/activity-provider.ts";
import { filterPlaces, type FilterCriteria } from "../_shared/filter-service.ts";
import { checkAvailability } from "../_shared/availability-guard.ts";
import { scanAllThemes } from "../_shared/places-scanner.ts";
import type { OutdoorActivity } from "../_shared/outdoor-types.ts";

// ── Structured Logger ─────────────────────────────────────────────────────
function createRequestLogger(reqId: string) {
  const t0 = Date.now();
  const elapsed = () => `${Date.now() - t0}ms`;

  return {
    start(data: Record<string, unknown>) {
      console.log(`\n${"═".repeat(70)}`);
      console.log(`[MOGO ${reqId}] 🦉 REQUEST START | ${JSON.stringify(data)}`);
      console.log(`${"═".repeat(70)}`);
    },
    step(emoji: string, label: string, data?: unknown) {
      const detail = data !== undefined ? ` | ${typeof data === "string" ? data : JSON.stringify(data)}` : "";
      console.log(`[MOGO ${reqId}] ${emoji} ${label} (${elapsed()})${detail}`);
    },
    llmInput(model: string, messages: Array<{ role: string; content: string }>, maxTokens: number) {
      console.log(`[MOGO ${reqId}] 📤 LLM INPUT (${elapsed()}) | model=${model}, messages=${messages.length}, maxTokens=${maxTokens}`);
      for (let i = 0; i < messages.length; i++) {
        const m = messages[i];
        const preview = m.content.length > 300 ? m.content.slice(0, 300) + "…" : m.content;
        console.log(`[MOGO ${reqId}]    [${i}] ${m.role} (${m.content.length}c): ${preview}`);
      }
    },
    llmOutput(model: string, content: string, usage?: { prompt_tokens: number; completion_tokens: number; total_tokens: number }) {
      const preview = content.length > 500 ? content.slice(0, 500) + "…" : content;
      const usageStr = usage ? `tokens: ${usage.prompt_tokens}in/${usage.completion_tokens}out/${usage.total_tokens}total` : "no usage";
      console.log(`[MOGO ${reqId}] 📥 LLM OUTPUT (${elapsed()}) | model=${model}, ${usageStr}`);
      console.log(`[MOGO ${reqId}]    raw: ${preview}`);
    },
    response(parsed: unknown) {
      const d = parsed as Record<string, unknown>;
      const summary: Record<string, unknown> = { statut: d.statut, phase: d.phase, question: d.question };
      if (d.options) summary.options = d.options;
      if (d.recommandation_finale) {
        const rec = d.recommandation_finale as Record<string, unknown>;
        summary.reco = { titre: rec.titre, tags: rec.tags };
      }
      console.log(`[MOGO ${reqId}] ✅ RESPONSE (${elapsed()}) | ${JSON.stringify(summary)}`);
    },
    warn(label: string, data?: unknown) {
      const detail = data !== undefined ? ` | ${typeof data === "string" ? data : JSON.stringify(data)}` : "";
      console.warn(`[MOGO ${reqId}] ⚠️  ${label} (${elapsed()})${detail}`);
    },
    error(label: string, err?: unknown) {
      const detail = err !== undefined ? ` | ${err instanceof Error ? err.message : JSON.stringify(err)}` : "";
      console.error(`[MOGO ${reqId}] ❌ ${label} (${elapsed()})${detail}`);
    },
    end(status: number) {
      console.log(`[MOGO ${reqId}] 🏁 REQUEST END (${elapsed()}) | status=${status}`);
      console.log(`${"─".repeat(70)}\n`);
    },
  };
}

// ── Constants ─────────────────────────────────────────────────────────────

// --- LLM provider (drill-down) ---
const LLM_API_URL = Deno.env.get("LLM_API_URL") ?? "http://localhost:11434/v1";
const LLM_MODEL = Deno.env.get("LLM_MODEL") ?? "gpt-oss:120b-cloud";
const LLM_API_KEY = Deno.env.get("LLM_API_KEY") ?? "";
const drillProvider = createProvider(LLM_API_URL, LLM_MODEL, LLM_API_KEY);

// --- Big model (finalisation) — optionnel ---
const LLM_FINAL_API_URL = Deno.env.get("LLM_FINAL_API_URL");
const LLM_FINAL_MODEL = Deno.env.get("LLM_FINAL_MODEL");
const LLM_FINAL_API_KEY = Deno.env.get("LLM_FINAL_API_KEY") ?? "";
const hasBigModel = !!(LLM_FINAL_API_URL && LLM_FINAL_MODEL);
const bigProvider = hasBigModel ? createProvider(LLM_FINAL_API_URL!, LLM_FINAL_MODEL!, LLM_FINAL_API_KEY) : null;

// --- Google Places ---
const GOOGLE_PLACES_API_KEY = Deno.env.get("GOOGLE_PLACES_API_KEY") ?? "";
const placesAdapter = GOOGLE_PLACES_API_KEY ? new GooglePlacesAdapter(GOOGLE_PLACES_API_KEY) : null;

// --- Pricing ---
const LLM_INPUT_PRICE_PER_M = parseFloat(Deno.env.get("LLM_INPUT_PRICE_PER_M") ?? "0");
const LLM_OUTPUT_PRICE_PER_M = parseFloat(Deno.env.get("LLM_OUTPUT_PRICE_PER_M") ?? "0");
const LLM_FINAL_INPUT_PRICE_PER_M = parseFloat(Deno.env.get("LLM_FINAL_INPUT_PRICE_PER_M") ?? "0");
const LLM_FINAL_OUTPUT_PRICE_PER_M = parseFloat(Deno.env.get("LLM_FINAL_OUTPUT_PRICE_PER_M") ?? "0");

// --- Google Places Pricing ($/appel, par SKU activé) ---
const GPLACES_NEARBY_ENTERPRISE_PRICE = parseFloat(Deno.env.get("GPLACES_NEARBY_ENTERPRISE_PRICE") ?? "0");
const GPLACES_NEARBY_ENTERPRISE_ATMO_PRICE = parseFloat(Deno.env.get("GPLACES_NEARBY_ENTERPRISE_ATMO_PRICE") ?? "0");
const GPLACES_DETAILS_ENTERPRISE_ATMO_PRICE = parseFloat(Deno.env.get("GPLACES_DETAILS_ENTERPRISE_ATMO_PRICE") ?? "0");

function computeCostUsd(usage: { prompt_tokens: number; completion_tokens: number } | undefined, isBigModel: boolean): number | null {
  if (!usage) return null;
  const inputPrice = isBigModel ? LLM_FINAL_INPUT_PRICE_PER_M : LLM_INPUT_PRICE_PER_M;
  const outputPrice = isBigModel ? LLM_FINAL_OUTPUT_PRICE_PER_M : LLM_OUTPUT_PRICE_PER_M;
  if (inputPrice === 0 && outputPrice === 0) return null;
  return (usage.prompt_tokens * inputPrice + usage.completion_tokens * outputPrice) / 1_000_000;
}

function logGplacesCall(
  supabase: ReturnType<typeof createClient>,
  userId: string,
  sessionId: string,
  apiMethod: "nearby_search" | "place_details",
  sku: string,
  costUsd: number | null,
  placeCount: number,
) {
  supabase.from("gplaces_calls").insert({
    user_id: userId,
    session_id: sessionId,
    api_method: apiMethod,
    sku,
    cost_usd: costUsd,
    place_count: placeCount,
  }).then(() => {});
}

const MIN_DEPTH = Math.max(2, parseInt(Deno.env.get("MIN_DEPTH") ?? "4", 10));
const MONTHLY_SCAN_QUOTA = Math.max(1, parseInt(Deno.env.get("MONTHLY_SCAN_QUOTA") ?? "60", 10));
const PLACES_MIN_RATING = 4.0;

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers": "authorization, content-type, apikey, x-client-info",
};

function jsonResponse(body: unknown, status = 200) {
  return Response.json(body, { status, headers: corsHeaders });
}

// --- Sanitisation helpers ---
const stripMd = (t: string) => t
  .replace(/\*\*([^*]+)\*\*/g, "$1").replace(/\*([^*]+)\*/g, "$1")
  .replace(/__([^_]+)__/g, "$1").replace(/_([^_]+)_/g, "$1")
  .replace(/`([^`]+)`/g, "$1").replace(/[\n\r]+/g, " ").replace(/\s{2,}/g, " ").trim();

const truncate = (t: string, maxLen: number) => {
  if (t.length <= maxLen) return t;
  const cut = t.lastIndexOf(" ", maxLen - 1);
  return (cut > maxLen * 0.4 ? t.slice(0, cut) : t.slice(0, maxLen - 1)) + "…";
};

const VALID_TAGS = new Set(["sport","culture","gastronomie","nature","detente","fete","creatif","jeux","musique","cinema","voyage","tech","social","insolite"]);

/**
 * Tente de réparer un JSON tronqué (output coupé par max_tokens).
 * Stratégie : supprimer la dernière valeur incomplète, puis fermer les crochets/accolades ouverts.
 */
function tryRepairJson(raw: string): Record<string, unknown> | null {
  let s = raw.trim();
  if (!s.startsWith("{")) return null;

  // Supprimer une valeur traînante incomplète (ex: `"B":` ou `"B": "some text`)
  // On coupe après la dernière virgule ou le dernier élément complet
  s = s.replace(/,\s*"[^"]*":\s*("(?:[^"\\]|\\.)*)?$/, "");   // clé: "valeur incomplète
  s = s.replace(/,\s*"[^"]*":\s*$/, "");                        // clé: (rien)
  s = s.replace(/,\s*"(?:[^"\\]|\\.)*$/, "");                   // string incomplète dans un array
  s = s.replace(/,\s*$/, "");                                    // virgule traînante

  // Fermer les crochets et accolades ouverts
  const opens: string[] = [];
  let inString = false;
  let escape = false;
  for (const ch of s) {
    if (escape) { escape = false; continue; }
    if (ch === "\\") { escape = true; continue; }
    if (ch === '"') { inString = !inString; continue; }
    if (inString) continue;
    if (ch === "{" || ch === "[") opens.push(ch);
    if (ch === "}") { if (opens.length && opens[opens.length - 1] === "{") opens.pop(); }
    if (ch === "]") { if (opens.length && opens[opens.length - 1] === "[") opens.pop(); }
  }

  // Fermer dans l'ordre inverse
  for (let i = opens.length - 1; i >= 0; i--) {
    s += opens[i] === "{" ? "}" : "]";
  }

  try {
    return JSON.parse(s);
  } catch {
    return null;
  }
}

function sanitizeParsed(d: Record<string, unknown>, log: ReturnType<typeof createRequestLogger>): void {
  // Récupérer mogogo_message si manquant
  if (typeof d.mogogo_message !== "string" || !(d.mogogo_message as string).trim()) {
    if (typeof (d as any).message === "string" && (d as any).message.trim()) {
      d.mogogo_message = (d as any).message;
      log.warn("RECOVERED mogogo_message from 'message' field");
    } else if (typeof d.question === "string") {
      d.mogogo_message = "Hmm, laisse-moi réfléchir...";
      log.warn("MISSING mogogo_message, using fallback");
    }
  }

  if (typeof d.mogogo_message === "string") d.mogogo_message = truncate(stripMd(d.mogogo_message), 120);
  if (typeof d.question === "string") d.question = truncate(stripMd(d.question), 100);

  // Sanitiser subcategories[]
  if (Array.isArray(d.subcategories)) {
    d.subcategories = (d.subcategories as unknown[])
      .filter((s): s is string => typeof s === "string" && s.trim().length > 0)
      .map(s => truncate(stripMd(s.trim()), 60));
    if ((d.subcategories as string[]).length === 0) {
      delete d.subcategories;
    }
  }

  // Sanitiser subcategory_emojis[]
  if (Array.isArray(d.subcategories) && (d.subcategories as string[]).length > 0) {
    const subs = d.subcategories as string[];
    if (Array.isArray(d.subcategory_emojis)) {
      d.subcategory_emojis = (d.subcategory_emojis as unknown[])
        .map(e => typeof e === "string" ? e.slice(0, 4) : "🔮");
      // Aligner la longueur avec subcategories
      const emojis = d.subcategory_emojis as string[];
      while (emojis.length < subs.length) emojis.push("🔮");
      if (emojis.length > subs.length) d.subcategory_emojis = emojis.slice(0, subs.length);
    } else {
      d.subcategory_emojis = subs.map(() => "🔮");
    }
  } else {
    delete d.subcategory_emojis;
  }

  // Si subcategories présent mais options absent → construire depuis pool[0]/pool[1]
  if (Array.isArray(d.subcategories) && (d.subcategories as string[]).length >= 2 && (!d.options || typeof d.options !== "object")) {
    const pool = d.subcategories as string[];
    d.options = { A: pool[0], B: pool[1] };
    log.warn("BUILT options from subcategories pool");
  }

  if (d.statut === "en_cours" && d.question && (!d.options || typeof d.options !== "object")) {
    d.options = { A: "Option A", B: "Option B" };
    log.warn("MISSING options, using fallback A/B");
  }

  if (d.options && typeof d.options === "object") {
    const opts = d.options as Record<string, unknown>;
    if (typeof opts.A === "string") opts.A = truncate(stripMd(opts.A), 60);
    if (typeof opts.B === "string") opts.B = truncate(stripMd(opts.B), 60);
    if (!opts.A || (typeof opts.A === "string" && opts.A.trim() === "")) opts.A = "Option A";
    if (!opts.B || (typeof opts.B === "string" && opts.B.trim() === "")) opts.B = "Option B";
  }

  if (d.recommandation_finale && typeof d.recommandation_finale === "object") {
    const rec = d.recommandation_finale as Record<string, unknown>;
    if (typeof rec.titre === "string") rec.titre = stripMd(rec.titre);
    if (typeof rec.explication === "string") rec.explication = stripMd(rec.explication);
    if (typeof rec.justification === "string") rec.justification = truncate(stripMd(rec.justification), 80);
    if (Array.isArray(rec.tags)) {
      rec.tags = (rec.tags as string[]).filter(t => typeof t === "string" && VALID_TAGS.has(t));
    }
    if (!Array.isArray(rec.actions)) rec.actions = [];
    // Sanitiser chaque action : garantir type + label + query
    const VALID_ACTION_TYPES = new Set(["maps","web","steam","play_store","youtube","streaming","spotify"]);
    rec.actions = (rec.actions as Array<Record<string, unknown>>)
      .filter((a): a is Record<string, unknown> => a != null && typeof a === "object")
      .map(a => {
        const type = typeof a.type === "string" && VALID_ACTION_TYPES.has(a.type) ? a.type : "web";
        const label = typeof a.label === "string" && a.label.trim() ? a.label.trim() : (type === "maps" ? "Google Maps" : "Rechercher");
        const query = typeof a.query === "string" && a.query.trim() ? a.query.trim() : (rec.titre as string) ?? "activité";
        return { type, label, query };
      });
    if (!rec.explication || (typeof rec.explication === "string" && !rec.explication.trim())) {
      rec.explication = (rec.titre as string) ?? "Activité recommandée par Mogogo";
    }
  }

  // Garantir metadata
  if (!d.metadata || typeof d.metadata !== "object") {
    d.metadata = { pivot_count: 0, current_branch: "Racine", depth: 1 };
  }
}

// ══════════════════════════════════════════════════════════════════════════
// Main handler
// ══════════════════════════════════════════════════════════════════════════

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }
  if (req.method !== "POST") {
    return jsonResponse({ error: "Method not allowed" }, 405);
  }

  const reqId = crypto.randomUUID().slice(0, 8);
  const log = createRequestLogger(reqId);

  try {
    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    );

    // ── Auth ──────────────────────────────────────────────────────────
    const authHeader = req.headers.get("authorization");
    if (!authHeader) { log.end(401); return jsonResponse({ error: "Missing authorization header" }, 401); }

    const token = authHeader.replace("Bearer ", "");
    const [authResult, body] = await Promise.all([
      supabase.auth.getUser(token),
      req.json(),
    ]);

    const { data: authData, error: authError } = authResult;
    if (authError || !authData.user) { log.end(401); return jsonResponse({ error: "Invalid or expired token" }, 401); }

    const user = authData.user;
    const {
      context,
      phase,           // "theme_duel" | "drill_down" | "reroll"
      choice,          // "A" | "B" | "neither" | theme slug
      theme_slug,      // Thème sélectionné en Phase 2
      drill_history,   // Historique drill-down
      session_id,
      device_id,
      preferences,
      rejected_themes,
      // Legacy fields (V2 compat)
      history,
    } = body;

    const lang = (context?.language as string) ?? "fr";

    // Normaliser location : le client envoie { latitude, longitude } (expo-location),
    // le serveur attend { lat, lng } partout.
    if (context?.location) {
      const loc = context.location;
      if (loc.latitude !== undefined && loc.lat === undefined) {
        context.location = { lat: loc.latitude, lng: loc.longitude };
      }
    }

    log.start({
      user: user.id.slice(0, 8),
      session: session_id?.slice(0, 8),
      phase: phase ?? "legacy",
      choice,
      theme_slug,
      lang,
      device: device_id?.slice(0, 8),
    });

    // ── Profile ──────────────────────────────────────────────────────
    const { data: profile } = await supabase.from("profiles").select("*").eq("id", user.id).single();
    if (profile) {
      log.step("👤", "PROFILE", { plan: profile.plan });
    }

    // ══════════════════════════════════════════════════════════════════
    // Quota Check : lecture seule (pas de LLM, pas d'incrément)
    // ══════════════════════════════════════════════════════════════════
    if (phase === "quota_check") {
      log.step("📊", "QUOTA CHECK", "read-only");

      try {
        const { data: mapping } = await supabase
          .from("revenuecat_user_mapping")
          .select("original_app_user_id")
          .eq("app_user_id", user.id)
          .maybeSingle();

        if (!mapping) {
          // Pas de mapping RC → fail-open, quota non applicable
          log.step("📊", "QUOTA CHECK SKIP", "no RC mapping (fail-open)");
          log.end(200);
          return jsonResponse({ phase: "quota_check", allowed: true, scans_used: 0, scans_limit: MONTHLY_SCAN_QUOTA, resets_at: null });
        }

        const { data: quotaResult } = await supabase.rpc("get_quota_usage", {
          p_original_app_user_id: mapping.original_app_user_id,
          p_monthly_limit: MONTHLY_SCAN_QUOTA,
        });

        const row = quotaResult?.[0];
        const allowed = !row || row.scans_used < row.scans_limit;
        log.step("📊", "QUOTA RESULT", { allowed, used: row?.scans_used, limit: row?.scans_limit, resets_at: row?.resets_at });
        log.end(200);
        return jsonResponse({
          phase: "quota_check",
          allowed,
          scans_used: row?.scans_used ?? 0,
          scans_limit: row?.scans_limit ?? MONTHLY_SCAN_QUOTA,
          resets_at: row?.resets_at ?? null,
        });
      } catch (err) {
        // Fail-open : erreur technique ne bloque pas l'utilisateur
        log.warn("QUOTA CHECK ERROR (fail-open)", err);
        log.end(200);
        return jsonResponse({ phase: "quota_check", allowed: true, scans_used: 0, scans_limit: MONTHLY_SCAN_QUOTA, resets_at: null });
      }
    }

    // ══════════════════════════════════════════════════════════════════
    // Phase 2 : Theme Duel (algorithmique, pas de LLM)
    // ══════════════════════════════════════════════════════════════════
    if (phase === "theme_duel") {
      log.step("🎯", "PHASE 2: THEME DUEL", "algorithmic");

      const env = context?.environment ?? "env_shelter";

      // Vérifier l'épuisement des thèmes AVANT la plumes gate
      const allEligible = getEligibleThemes({ environment: env });
      const rejectedSet = new Set(Array.isArray(rejected_themes) ? rejected_themes as string[] : []);
      const eligible = rejectedSet.size > 0
        ? allEligible.filter(t => !rejectedSet.has(t.slug))
        : allEligible;

      if (eligible.length < 2) {
        log.step("🎭", "THEMES EXHAUSTED", { rejected: rejectedSet.size, total: allEligible.length });
        log.end(200);
        return jsonResponse({ phase: "themes_exhausted" });
      }

      const userHintTags = Array.isArray(context?.user_hint_tags) ? context.user_hint_tags as string[] : [];

      // Si Q0 avec tags → sélection directe du thème
      if (userHintTags.length > 0) {
        const directTheme = getThemeByTags(userHintTags);
        if (directTheme) {
          log.step("⚡", "Q0 DIRECT THEME", { theme: directTheme.slug });
          const response = {
            phase: "theme_selected",
            theme: { slug: directTheme.slug, emoji: directTheme.emoji },
          };
          log.response(response);
          log.end(200);
          return jsonResponse(response);
        }
      }

      // Tirage de duel
      const [themeA, themeB] = pickThemeDuel(eligible);

      const response = {
        phase: "theme_duel",
        duel: {
          themeA: { slug: themeA.slug, emoji: themeA.emoji },
          themeB: { slug: themeB.slug, emoji: themeB.emoji },
        },
      };

      const callSessionId = session_id ?? crypto.randomUUID();
      supabase.from("llm_calls").insert({
        user_id: user.id, session_id: callSessionId,
        prompt_tokens: 0, completion_tokens: 0, total_tokens: 0,
        cost_usd: 0, model: "theme-duel-algo", choice: null,
      }).then(() => {});

      log.response(response);
      log.end(200);
      return jsonResponse(response);
    }

    // ══════════════════════════════════════════════════════════════════
    // Phase Out-Home 1/2 : Scan Google Places (pas de LLM)
    // ══════════════════════════════════════════════════════════════════
    if (phase === "places_scan") {
      // Safety net : le client ne devrait jamais appeler places_scan en INSPIRATION
      if (context?.resolution_mode === "INSPIRATION") {
        log.warn("PLACES_SCAN called in INSPIRATION mode, skipping");
        log.end(200);
        return jsonResponse({ phase: "places_scan_complete", activities: [], shortage: true });
      }
      const isHome = context?.environment === "env_home";
      if (isHome) { log.end(400); return jsonResponse({ error: "places_scan is for out-home only" }, 400); }
      if (!placesAdapter || !context?.location) {
        log.end(400); return jsonResponse({ error: "Google Places or location unavailable" }, 400);
      }

      log.step("📍", "PHASE OUT-HOME 1/2: PLACES SCAN", { env: context.environment });

      // Plumes gate (même logique que drill_down — vérification au premier appel)
      if (device_id && typeof device_id === "string" && profile?.plan !== "premium") {
        log.step("🪶", "PLUME GATE", "places_scan, checking plumes…");
        const { data: plumesInfo } = await supabase.rpc("get_device_plumes_info", { p_device_id: device_id });
        const devicePremium = plumesInfo?.[0]?.is_premium === true;
        if (!devicePremium) {
          const plumesCount = plumesInfo?.[0]?.plumes_count ?? 0;
          if (plumesCount < 10) {
            log.warn("PLUME GATE BLOCKED", { plumes: plumesCount });
            log.end(402);
            return jsonResponse({ error: "no_plumes" }, 402);
          }
          log.step("🪶", "PLUME GATE OK", { plumes: plumesCount });
        } else {
          log.step("🪶", "PLUME GATE SKIP", "device is premium");
        }
      }

      // Quota anti-churning via mapping webhook (fail-open)
      try {
        const { data: mapping, error: mappingErr } = await supabase
          .from("revenuecat_user_mapping")
          .select("original_app_user_id")
          .eq("app_user_id", user.id)
          .maybeSingle();

        if (mappingErr) {
          log.warn("QUOTA MAPPING DB ERROR", mappingErr.message);
        } else if (mapping) {
          const { data: quotaResult } = await supabase.rpc("check_and_increment_quota", {
            p_original_app_user_id: mapping.original_app_user_id,
            p_monthly_limit: MONTHLY_SCAN_QUOTA,
          });
          const row = quotaResult?.[0];
          if (row && !row.allowed) {
            log.warn("QUOTA EXHAUSTED", { used: row.scans_used, limit: row.scans_limit });
            log.end(429);
            return jsonResponse({
              error: "quota_exhausted",
              scans_used: row.scans_used,
              scans_limit: row.scans_limit,
            }, 429);
          }
          log.step("📊", "QUOTA OK", { used: row?.scans_used, limit: row?.scans_limit });
        } else {
          log.step("📊", "QUOTA SKIP", "no RC mapping yet (fail-open)");
        }
      } catch (err) {
        // Fail-open : erreur technique ne bloque pas l'utilisateur légitime
        console.warn("[Quota] check failed, proceeding:", err);
      }

      // Scanner les thèmes : filtré par theme_slug si fourni, sinon tous les éligibles
      let scanThemes = getEligibleThemes({ environment: context.environment });
      if (theme_slug && typeof theme_slug === "string") {
        const matched = THEMES.find(t => t.slug === theme_slug);
        if (matched) {
          scanThemes = [matched];
          log.step("🎯", "THEME FILTER", { slug: theme_slug, placeTypes: matched.placeTypes });
        } else {
          log.warn("THEME_SLUG NOT FOUND", { slug: theme_slug, fallback: "all eligible" });
        }
      }
      // Famille avec enfants < 12 ans → demander goodForChildren à Google Places
      const familyWithYoungChildren =
        context.social === "family"
        && context.children_ages?.min != null
        && context.children_ages.min < 12;

      const scanResult = await scanAllThemes(
        placesAdapter, scanThemes,
        context.location, context.search_radius ?? 10000,
        lang,
        { requireOpenNow: true, minRating: PLACES_MIN_RATING },
        { familyWithYoungChildren },
      );

      log.step("📍", "SCAN RESULT", {
        activities: scanResult.activities.length,
        totalReqs: scanResult.totalRequests,
        successful: scanResult.successfulRequests,
        rawCount: scanResult.rawCount,
        shortage: scanResult.shortage,
      });

      // Tracker le scan Google Places
      const callSessionId = session_id ?? crypto.randomUUID();
      const scanSku = familyWithYoungChildren
        ? "nearby_search_enterprise_atmosphere"
        : "nearby_search_enterprise";
      const scanCostPerCall = familyWithYoungChildren
        ? GPLACES_NEARBY_ENTERPRISE_ATMO_PRICE
        : GPLACES_NEARBY_ENTERPRISE_PRICE;
      const scanCost = scanCostPerCall > 0 ? scanCostPerCall : null;
      logGplacesCall(supabase, user.id, callSessionId, "nearby_search", scanSku, scanCost, scanResult.activities.length);

      log.end(200);
      return jsonResponse({
        phase: "places_scan_complete",
        activities: scanResult.activities,
        shortage: scanResult.shortage,
        scan_stats: {
          total_requests: scanResult.totalRequests,
          successful: scanResult.successfulRequests,
          raw_count: scanResult.rawCount,
        },
      });
    }

    // ══════════════════════════════════════════════════════════════════
    // Phase Out-Home 2/2 : Pool de dichotomie (LLM)
    // ══════════════════════════════════════════════════════════════════
    if (phase === "outdoor_pool") {
      const activities: OutdoorActivity[] = Array.isArray(body.activities) ? body.activities : [];
      log.step("🎯", "PHASE OUT-HOME 2/2: OUTDOOR POOL", { activitiesCount: activities.length });

      if (activities.length < 3) {
        log.step("⚠️", "TOO FEW ACTIVITIES", "< 3, skipping pool generation");
        log.end(200);
        return jsonResponse({ phase: "outdoor_pool_complete", dichotomy_pool: null });
      }

      const describedCtx = describeContextV3(context ?? {}, lang);
      const poolMessages = buildOutdoorDichotomyMessages(
        activities,
        describedCtx,
        lang,
        context?.user_hint as string | undefined,
      );

      const poolProvider = hasBigModel ? bigProvider! : drillProvider;
      const poolModel = hasBigModel ? LLM_FINAL_MODEL! : LLM_MODEL;

      const poolMaxTokens = 8000;
      log.llmInput(poolModel, poolMessages, poolMaxTokens);
      const llmStart = Date.now();

      let content: string;
      let usage: { prompt_tokens: number; completion_tokens: number; total_tokens: number } | undefined;

      try {
        const result = await poolProvider.call({
          model: poolModel, messages: poolMessages, temperature: 0.5, maxTokens: poolMaxTokens,
        });
        content = result.content;
        usage = result.usage;
        log.llmOutput(poolModel, content, usage);
        log.step("⏱️", "LLM LATENCY", `${Date.now() - llmStart}ms`);
      } catch (err) {
        log.error(`OUTDOOR POOL LLM FAILED after ${Date.now() - llmStart}ms`, err);
        log.end(502);
        return jsonResponse({ error: "LLM request failed" }, 502);
      }

      let dichotomyPool: Record<string, unknown> | null = null;
      try {
        dichotomyPool = JSON.parse(content);
      } catch {
        dichotomyPool = tryRepairJson(content);
        if (dichotomyPool) {
          log.warn("OUTDOOR POOL JSON REPAIRED (truncated output)");
        } else {
          log.error("OUTDOOR POOL JSON PARSE FAILED");
          log.end(502);
          return jsonResponse({ error: "LLM returned invalid JSON for dichotomy pool" }, 502);
        }
      }

      // Sanitiser le pool
      if (dichotomyPool && typeof dichotomyPool.mogogo_message === "string") {
        dichotomyPool.mogogo_message = truncate(stripMd(dichotomyPool.mogogo_message as string), 120);
      }
      if (dichotomyPool && Array.isArray(dichotomyPool.duels)) {
        for (const duel of dichotomyPool.duels as Array<Record<string, unknown>>) {
          if (typeof duel.question === "string") duel.question = truncate(stripMd(duel.question), 80);
          if (typeof duel.labelA === "string") duel.labelA = truncate(stripMd(duel.labelA), 40);
          if (typeof duel.labelB === "string") duel.labelB = truncate(stripMd(duel.labelB), 40);
        }
      }

      // Tracker les tokens
      const costUsd = computeCostUsd(usage, hasBigModel);
      const callSessionId = session_id ?? crypto.randomUUID();
      supabase.from("llm_calls").insert({
        user_id: user.id, session_id: callSessionId,
        prompt_tokens: usage?.prompt_tokens ?? null,
        completion_tokens: usage?.completion_tokens ?? null,
        total_tokens: usage?.total_tokens ?? null,
        cost_usd: costUsd, model: poolModel, choice: "outdoor_pool",
      }).then(() => {});

      // Consommer les plumes au moment de la génération du pool
      if (device_id && typeof device_id === "string" && profile?.plan !== "premium") {
        const { data: pInfo } = await supabase.rpc("get_device_plumes_info", { p_device_id: device_id });
        if (pInfo?.[0]?.is_premium !== true) {
          log.step("🪶", "PLUME CONSUME", "outdoor_pool → consuming 10 plumes");
          supabase.rpc("consume_plumes", { p_device_id: device_id, p_amount: 10 }).then(({ error: rpcErr }) => {
            if (rpcErr) log.error("PLUME CONSUME FAILED", rpcErr);
          });
        }
      }

      log.step("✅", "OUTDOOR POOL GENERATED", {
        duels: Array.isArray(dichotomyPool?.duels) ? (dichotomyPool!.duels as unknown[]).length : 0,
      });
      log.end(200);
      return jsonResponse({
        phase: "outdoor_pool_complete",
        dichotomy_pool: dichotomyPool,
      });
    }

    // ══════════════════════════════════════════════════════════════════
    // Phase Place Details : enrichissement des finalistes (pas de LLM)
    // ══════════════════════════════════════════════════════════════════
    if (phase === "places_enrich") {
      const placeIds: string[] = Array.isArray(body.place_ids) ? body.place_ids.slice(0, 2) : [];
      log.step("📍", "PHASE PLACES_ENRICH", { placeIds });

      if (!placesAdapter || placeIds.length === 0) {
        log.end(200);
        return jsonResponse({ phase: "places_enrich_complete", enrichments: {} });
      }

      const results = await Promise.all(
        placeIds.map(async (id: string) => {
          try {
            const details = await placesAdapter.getPlaceDetails(id, lang);
            if (!details) return [id, null] as const;
            return [id, {
              formattedAddress: details.formattedAddress ?? null,
              editorialSummary: details.editorialSummary?.text ?? null,
              openingHoursText: details.regularOpeningHours?.weekdayDescriptions ?? null,
              websiteUri: details.websiteUri ?? null,
              phoneNumber: details.nationalPhoneNumber ?? null,
              isOpen: details.currentOpeningHours?.openNow ?? null,
              priceRange: details.priceRange ?? null,
            }] as const;
          } catch (err) {
            log.warn("PLACE_DETAILS_FAILED", { placeId: id, error: err });
            return [id, null] as const;
          }
        })
      );

      const enrichments: Record<string, any> = {};
      for (const [id, data] of results) {
        if (data) enrichments[id] = data;
      }

      // Tracker chaque appel Place Details
      const enrichCallSessionId = session_id ?? crypto.randomUUID();
      const detailsCost = GPLACES_DETAILS_ENTERPRISE_ATMO_PRICE > 0 ? GPLACES_DETAILS_ENTERPRISE_ATMO_PRICE : null;
      for (const id of placeIds) {
        logGplacesCall(supabase, user.id, enrichCallSessionId, "place_details", "place_details_enterprise_atmosphere", detailsCost, 1);
      }

      log.step("✅", "PLACES_ENRICH DONE", { enrichedCount: Object.keys(enrichments).length });
      log.end(200);
      return jsonResponse({ phase: "places_enrich_complete", enrichments });
    }

    // ══════════════════════════════════════════════════════════════════
    // Phase 3 : Drill-Down (LLM + Places)
    // ══════════════════════════════════════════════════════════════════
    if (phase === "drill_down") {
      const isHome = context?.environment === "env_home";
      const drillHistory: DrillDownNode[] = Array.isArray(drill_history) ? drill_history : [];
      const selectedTheme = theme_slug ?? "insolite";

      log.step("🔍", "PHASE 3: DRILL DOWN", { theme: selectedTheme, isHome, historyLen: drillHistory.length, choice });

      // ── Plumes gate (vérification seulement, consommation au finalize) ──
      if (drillHistory.length === 0 && !choice && device_id && typeof device_id === "string" && profile?.plan !== "premium") {
        log.step("🪶", "PLUME GATE", "First drill-down call, checking plumes…");
        const { data: plumesInfo } = await supabase.rpc("get_device_plumes_info", { p_device_id: device_id });
        const devicePremium = plumesInfo?.[0]?.is_premium === true;
        if (!devicePremium) {
          const plumesCount = plumesInfo?.[0]?.plumes_count ?? 0;
          if (plumesCount < 10) {
            log.warn("PLUME GATE BLOCKED", { plumes: plumesCount });
            log.end(402);
            return jsonResponse({ error: "no_plumes" }, 402);
          }
          log.step("🪶", "PLUME GATE OK", { plumes: plumesCount });
        } else {
          log.step("🪶", "PLUME GATE SKIP", "device is premium");
        }
      }

      const forceFinalize = body.force_finalize === true;

      // Construire le drill-down state
      const ddState = buildDrillDownState({
        themeSlug: selectedTheme,
        isHome,
        history: drillHistory,
        choice: choice as "A" | "B" | "neither" | undefined,
        minDepth: MIN_DEPTH,
        forceFinalize,
      });

      log.step("🧭", "DRILL STATE", {
        mode: ddState.mode,
        depth: ddState.depth,
        mayFinalize: ddState.mayFinalize,
        isNeither: ddState.isNeither,
        shouldBacktrack: ddState.shouldBacktrack,
        isImpasse: ddState.isImpasse,
        fallbackLevel: ddState.fallbackLevel,
        branchPath: ddState.branchPath,
      });

      // Si mode outing LOCATION_BASED et places adapter dispo, chercher des places
      const isLocationBased = context?.resolution_mode === "LOCATION_BASED";
      let placesContext = "";
      if (!isHome && isLocationBased && placesAdapter && context?.location) {
        const themeConfig = THEMES.find(t => t.slug === selectedTheme);
        if (themeConfig) {
          const radius = context.search_radius ?? 10000;

          const radarResult = await checkAvailability(
            placesAdapter,
            { requireOpenNow: true, minRating: PLACES_MIN_RATING },
            { location: context.location, radius, types: themeConfig.placeTypes, language: lang },
          );

          // Tracker l'appel Nearby Search (radar)
          const radarSessionId = session_id ?? crypto.randomUUID();
          const radarCost = GPLACES_NEARBY_ENTERPRISE_PRICE > 0 ? GPLACES_NEARBY_ENTERPRISE_PRICE : null;
          logGplacesCall(supabase, user.id, radarSessionId, "nearby_search", "nearby_search_enterprise", radarCost, radarResult.count);

          if (radarResult.available) {
            // Fournir les noms des lieux au LLM pour ancrer ses suggestions
            const topPlaces = radarResult.places.slice(0, 5).map(p => p.name);
            placesContext = `\nLIEUX DISPONIBLES À PROXIMITÉ : ${topPlaces.join(", ")}. Tu peux t'en inspirer pour tes propositions de sous-catégories.`;
            log.step("📍", "PLACES FOUND", { count: radarResult.count, top: topPlaces });
          } else {
            log.step("📍", "NO PLACES", "no results after filtering");
          }
        }
      }

      // Construire les messages LLM
      const describedCtx = describeContextV3(context ?? {}, lang);
      const messages = buildDrillDownMessages(
        ddState,
        describedCtx,
        drillHistory,
        lang,
        preferences && typeof preferences === "string" && preferences.length > 0 ? preferences : undefined,
        context?.user_hint as string | undefined,
      );

      // Ajouter le contexte places si disponible
      if (placesContext) {
        messages.push({ role: "system", content: placesContext });
      }

      // Choisir le modèle : big model pour impasse ou forceFinalize
      // Pour mayFinalize, le LLM décide → on utilise le fast model + dual-model intercept
      const useBig = (ddState.isImpasse || forceFinalize) && hasBigModel;
      const activeProvider = useBig ? bigProvider! : drillProvider;
      const activeModel = useBig ? LLM_FINAL_MODEL! : LLM_MODEL;
      const maxTokens = 3000;

      log.llmInput(activeModel, messages, maxTokens);

      let content: string;
      let usage: { prompt_tokens: number; completion_tokens: number; total_tokens: number } | undefined;
      let modelUsed = activeModel;

      const llmStartTime = Date.now();
      try {
        const result = await activeProvider.call({ model: activeModel, messages, temperature: 0.7, maxTokens });
        content = result.content;
        usage = result.usage;
        log.llmOutput(activeModel, content, usage);
        log.step("⏱️", "LLM LATENCY", `${Date.now() - llmStartTime}ms`);
      } catch (err) {
        log.error(`LLM CALL FAILED after ${Date.now() - llmStartTime}ms`, err);
        const status = err instanceof OpenAIProviderError ? err.status : 502;
        log.end(status >= 500 ? 502 : status);
        return jsonResponse({ error: "LLM request failed" }, status >= 500 ? 502 : status);
      }

      // Interception dual-model : fast model finalise → appeler big model
      if (hasBigModel && !useBig) {
        try {
          const fastParsed = JSON.parse(content);
          if (fastParsed.statut === "finalisé") {
            log.step("🔄", "DUAL-MODEL INTERCEPT", `fast model finalized → calling big model (${LLM_FINAL_MODEL})`);
            const bigMessages = [...messages, { role: "system", content: "DIRECTIVE : Tu DOIS finaliser avec statut \"finalisé\", phase \"resultat\" et une recommandation_finale concrète." }];
            try {
              const bigStart = Date.now();
              const bigResult = await bigProvider!.call({ model: LLM_FINAL_MODEL!, messages: bigMessages, temperature: 0.7, maxTokens: 3000 });
              content = bigResult.content;
              usage = bigResult.usage;
              modelUsed = LLM_FINAL_MODEL!;
              log.llmOutput(LLM_FINAL_MODEL!, content, usage);
              log.step("⏱️", "BIG MODEL LATENCY", `${Date.now() - bigStart}ms`);
            } catch (bigErr) {
              log.warn("BIG MODEL FAILED, keeping fast model response", bigErr);
            }
          }
        } catch { /* JSON parse failed — will be caught below */ }
      }

      // Tracker les tokens
      const costUsd = computeCostUsd(usage, modelUsed === LLM_FINAL_MODEL);
      const callSessionId = session_id ?? crypto.randomUUID();
      supabase.from("llm_calls").insert({
        user_id: user.id, session_id: callSessionId,
        prompt_tokens: usage?.prompt_tokens ?? null,
        completion_tokens: usage?.completion_tokens ?? null,
        total_tokens: usage?.total_tokens ?? null,
        cost_usd: costUsd, model: modelUsed, choice: choice ?? null,
      }).then(() => {});

      // Parser la réponse (avec réparation si JSON tronqué)
      let parsed: Record<string, unknown>;
      try {
        parsed = JSON.parse(content);
      } catch {
        const repaired = tryRepairJson(content);
        if (repaired) {
          parsed = repaired;
          log.warn("JSON REPAIRED (truncated output)");
        } else {
          log.error("JSON PARSE FAILED");
          log.end(502);
          return jsonResponse({ error: "LLM returned invalid JSON" }, 502);
        }
      }

      sanitizeParsed(parsed, log);

      // ── Plumes consommation au finalize (une seule fois par session) ──
      if (parsed.statut === "finalisé" && device_id && typeof device_id === "string" && profile?.plan !== "premium") {
        const { data: pInfo } = await supabase.rpc("get_device_plumes_info", { p_device_id: device_id });
        if (pInfo?.[0]?.is_premium !== true) {
          log.step("🪶", "PLUME CONSUME", "Finalize → consuming 10 plumes");
          supabase.rpc("consume_plumes", { p_device_id: device_id, p_amount: 10 }).then(({ error: rpcErr }) => {
            if (rpcErr) log.error("PLUME CONSUME FAILED", rpcErr);
          });
        }
      }

      // Injecter les méta
      parsed._model_used = modelUsed;
      if (usage) parsed._usage = usage;
      parsed._next_may_finalize = ddState.depth + 1 >= MIN_DEPTH;

      log.response(parsed);
      log.end(200);
      return jsonResponse(parsed);
    }

    // ══════════════════════════════════════════════════════════════════
    // Reroll : proposer une alternative depuis le même thème
    // ══════════════════════════════════════════════════════════════════
    if (phase === "reroll" || choice === "reroll") {
      const rejectedTitles: string[] = Array.isArray(body.rejected_titles) ? body.rejected_titles : [];
      log.step("🔄", "REROLL", { theme: theme_slug, rejectedCount: rejectedTitles.length });

      // Garde-fou : limiter le nombre de rerolls
      const MAX_REROLLS = parseInt(Deno.env.get("MAX_REROLLS") ?? "10", 10);
      if (rejectedTitles.length >= MAX_REROLLS) {
        log.step("🚫", "MAX_REROLLS REACHED", { count: rejectedTitles.length, max: MAX_REROLLS });
        log.end(200);
        return jsonResponse({
          statut: "épuisé",
          phase: "resultat",
          mogogo_message: "max_rerolls_reached",
        });
      }

      const selectedTheme = theme_slug ?? "insolite";
      const drillHistory: DrillDownNode[] = Array.isArray(drill_history) ? drill_history : [];

      // Construire les messages LLM pour un reroll
      const describedCtx = describeContextV3(context ?? {}, lang);
      const messages: Array<{ role: string; content: string }> = [
        { role: "system", content: getDrillDownSystemPrompt() },
      ];

      if (LANGUAGE_INSTRUCTIONS[lang]) {
        messages.push({ role: "system", content: LANGUAGE_INSTRUCTIONS[lang] });
      }

      messages.push({ role: "user", content: `Contexte utilisateur : ${JSON.stringify(describedCtx)}` });

      if (preferences && typeof preferences === "string" && preferences.length > 0) {
        messages.push({ role: "system", content: preferences });
      }

      // Historique compressé
      for (const node of drillHistory) {
        messages.push({ role: "assistant", content: JSON.stringify({ q: node.question, A: node.optionA, B: node.optionB }) });
        messages.push({ role: "user", content: `Choix : ${node.choice}` });
      }

      const rejectedList = rejectedTitles.length > 0
        ? `\nACTIVITÉS DÉJÀ REJETÉES (ne les repropose JAMAIS, ni sous un autre nom, ni reformulées) :\n${rejectedTitles.map(t => `- "${t}"`).join("\n")}`
        : "";
      messages.push({
        role: "system",
        content: `DIRECTIVE : L'utilisateur a rejeté la proposition précédente.${rejectedList}\nTu DOIS proposer une activité COMPLÈTEMENT DIFFÉRENTE mais dans le thème "${selectedTheme}". Réponds avec statut "finalisé", phase "resultat" et une recommandation_finale concrète. Ne pose AUCUNE question.\nSi tu n'as VRAIMENT plus rien de différent à proposer, réponds exactement : { "statut": "épuisé", "phase": "resultat", "mogogo_message": "..." }. C'est OK de ne rien avoir d'autre.`,
      });

      const activeProvider = hasBigModel ? bigProvider! : drillProvider;
      const activeModel = hasBigModel ? LLM_FINAL_MODEL! : LLM_MODEL;

      log.llmInput(activeModel, messages, 3000);
      const llmStart = Date.now();

      let content: string;
      let usage: { prompt_tokens: number; completion_tokens: number; total_tokens: number } | undefined;

      try {
        const result = await activeProvider.call({ model: activeModel, messages, temperature: 0.8, maxTokens: 3000 });
        content = result.content;
        usage = result.usage;
        log.llmOutput(activeModel, content, usage);
        log.step("⏱️", "LLM LATENCY", `${Date.now() - llmStart}ms`);
      } catch (err) {
        log.error("REROLL LLM FAILED", err);
        log.end(502);
        return jsonResponse({ error: "LLM request failed" }, 502);
      }

      const callSessionId = session_id ?? crypto.randomUUID();
      supabase.from("llm_calls").insert({
        user_id: user.id, session_id: callSessionId,
        prompt_tokens: usage?.prompt_tokens ?? null, completion_tokens: usage?.completion_tokens ?? null,
        total_tokens: usage?.total_tokens ?? null,
        cost_usd: computeCostUsd(usage, hasBigModel), model: activeModel,
        choice: "reroll",
      }).then(() => {});

      let parsed: Record<string, unknown>;
      try {
        parsed = JSON.parse(content);
      } catch {
        const repaired = tryRepairJson(content);
        if (repaired) {
          parsed = repaired;
          log.warn("JSON REPAIRED (truncated output)");
        } else {
          log.error("JSON PARSE FAILED");
          log.end(502);
          return jsonResponse({ error: "LLM returned invalid JSON" }, 502);
        }
      }

      sanitizeParsed(parsed, log);
      parsed._model_used = activeModel;
      if (usage) parsed._usage = usage;

      log.response(parsed);
      log.end(200);
      return jsonResponse(parsed);
    }

    // ══════════════════════════════════════════════════════════════════
    // Legacy V2 fallback — pour compatibilité transition
    // ══════════════════════════════════════════════════════════════════
    log.warn("LEGACY V2 REQUEST", "no phase specified, returning error");
    log.end(400);
    return jsonResponse({ error: "Missing phase parameter. Use phase='theme_duel' or 'drill_down'." }, 400);

  } catch (error) {
    log.error("EDGE FUNCTION UNCAUGHT", error);
    log.end(500);
    return jsonResponse({ error: "Internal server error" }, 500);
  }
});
