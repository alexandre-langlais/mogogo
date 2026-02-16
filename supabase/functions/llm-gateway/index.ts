import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "jsr:@supabase/supabase-js@2";
import { createProvider, OpenAIProviderError } from "./providers.ts";
import { THEMES, getEligibleThemes, pickThemeDuel, getThemeByTags } from "../_shared/theme-engine.ts";
import { buildDrillDownState, type DrillDownNode } from "../_shared/drill-down-state.ts";
import { getDrillDownSystemPrompt, buildDrillDownMessages, describeContextV3, LANGUAGE_INSTRUCTIONS } from "../_shared/system-prompts-v3.ts";
import { GooglePlacesAdapter } from "../_shared/activity-provider.ts";
import { filterPlaces, BUDGET_TO_PRICE_LEVEL, type FilterCriteria } from "../_shared/filter-service.ts";
import { checkAvailability } from "../_shared/availability-guard.ts";

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

const QUOTA_LIMITS: Record<string, number> = { free: 500, premium: 5000 };

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

function computeCostUsd(usage: { prompt_tokens: number; completion_tokens: number } | undefined, isBigModel: boolean): number | null {
  if (!usage) return null;
  const inputPrice = isBigModel ? LLM_FINAL_INPUT_PRICE_PER_M : LLM_INPUT_PRICE_PER_M;
  const outputPrice = isBigModel ? LLM_FINAL_OUTPUT_PRICE_PER_M : LLM_OUTPUT_PRICE_PER_M;
  if (inputPrice === 0 && outputPrice === 0) return null;
  return (usage.prompt_tokens * inputPrice + usage.completion_tokens * outputPrice) / 1_000_000;
}

const MIN_DEPTH = Math.max(2, parseInt(Deno.env.get("MIN_DEPTH") ?? "4", 10));
const PLACES_MIN_RATING = 4.0;

// --- Quota messages ---
const QUOTA_MESSAGES: Record<string, string> = {
  fr: "Tu as atteint ta limite mensuelle ! Passe au plan Premium ou attends le mois prochain.",
  en: "You've reached your monthly limit! Upgrade to Premium or wait until next month.",
  es: "¡Has alcanzado tu límite mensual! Pasa al plan Premium o espera al próximo mes.",
};

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
    const isPrefetch = body.prefetch === true;

    log.start({
      user: user.id.slice(0, 8),
      session: session_id?.slice(0, 8),
      phase: phase ?? "legacy",
      choice,
      theme_slug,
      lang,
      device: device_id?.slice(0, 8),
    });

    // ── Profile & Quotas ──────────────────────────────────────────────
    const { data: profile } = await supabase.from("profiles").select("*").eq("id", user.id).single();

    let quotaRequestsCount = 0;
    if (profile) {
      const lastReset = new Date(profile.last_reset_date);
      const now = new Date();
      quotaRequestsCount = profile.requests_count;
      if (lastReset.getMonth() !== now.getMonth() || lastReset.getFullYear() !== now.getFullYear()) {
        quotaRequestsCount = 0;
        supabase.from("profiles").update({ requests_count: 0, last_reset_date: now.toISOString() }).eq("id", user.id).then(() => {});
      }
      const limit = QUOTA_LIMITS[profile.plan] ?? QUOTA_LIMITS.free;
      log.step("👤", "PROFILE", { plan: profile.plan, requests: quotaRequestsCount, limit });
      if (quotaRequestsCount >= limit) {
        log.warn("QUOTA EXCEEDED", { plan: profile.plan, count: quotaRequestsCount, limit });
        log.end(429);
        return jsonResponse({ error: "quota_exceeded", message: QUOTA_MESSAGES[lang] ?? QUOTA_MESSAGES.en, plan: profile.plan, limit }, 429);
      }
    }

    // ══════════════════════════════════════════════════════════════════
    // Phase 2 : Theme Duel (algorithmique, pas de LLM)
    // ══════════════════════════════════════════════════════════════════
    if (phase === "theme_duel") {
      log.step("🎯", "PHASE 2: THEME DUEL", "algorithmic");

      // ── Plumes gate ──
      if (device_id && typeof device_id === "string" && !isPrefetch && profile?.plan !== "premium") {
        log.step("🪶", "PLUME GATE", "Phase 2 start, checking plumes…");
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

        // Consommer les plumes immédiatement
        if (!devicePremium) {
          log.step("🪶", "PLUME CONSUME", "Phase 2 start → consuming 10 plumes");
          supabase.rpc("consume_plumes", { p_device_id: device_id, p_amount: 10 }).then(({ error: rpcErr }) => {
            if (rpcErr) log.error("PLUME CONSUME FAILED", rpcErr);
          });
        }
      }

      const env = context?.environment ?? "env_shelter";
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
          // Incrémenter le compteur
          if (profile && !isPrefetch) {
            supabase.from("profiles").update({ requests_count: quotaRequestsCount + 1, updated_at: new Date().toISOString() }).eq("id", user.id).then(() => {});
          }
          log.response(response);
          log.end(200);
          return jsonResponse(response);
        }
      }

      // Tirage de duel (exclure les thèmes rejetés)
      const allEligible = getEligibleThemes({ environment: env });
      const rejectedSet = new Set(Array.isArray(rejected_themes) ? rejected_themes as string[] : []);
      const eligible = rejectedSet.size > 0
        ? allEligible.filter(t => !rejectedSet.has(t.slug))
        : allEligible;
      // Si moins de 2 thèmes restants, réinitialiser (tout est rejeté)
      const pool = eligible.length >= 2 ? eligible : allEligible;
      const [themeA, themeB] = pickThemeDuel(pool);

      const response = {
        phase: "theme_duel",
        duel: {
          themeA: { slug: themeA.slug, emoji: themeA.emoji },
          themeB: { slug: themeB.slug, emoji: themeB.emoji },
        },
      };

      // Incrémenter le compteur
      if (profile && !isPrefetch) {
        supabase.from("profiles").update({ requests_count: quotaRequestsCount + 1, updated_at: new Date().toISOString() }).eq("id", user.id).then(() => {});
      }

      const callSessionId = session_id ?? crypto.randomUUID();
      supabase.from("llm_calls").insert({
        user_id: user.id, session_id: callSessionId,
        prompt_tokens: 0, completion_tokens: 0, total_tokens: 0,
        cost_usd: 0, model: "theme-duel-algo", choice: null, is_prefetch: isPrefetch,
      }).then(() => {});

      log.response(response);
      log.end(200);
      return jsonResponse(response);
    }

    // ══════════════════════════════════════════════════════════════════
    // Phase 3 : Drill-Down (LLM + Places)
    // ══════════════════════════════════════════════════════════════════
    if (phase === "drill_down") {
      const isHome = context?.environment === "env_home";
      const drillHistory: DrillDownNode[] = Array.isArray(drill_history) ? drill_history : [];
      const selectedTheme = theme_slug ?? "insolite";

      log.step("🔍", "PHASE 3: DRILL DOWN", { theme: selectedTheme, isHome, historyLen: drillHistory.length, choice });

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

      // Si mode outing et places adapter dispo, chercher des places
      let placesContext = "";
      if (!isHome && placesAdapter && context?.location) {
        const themeConfig = THEMES.find(t => t.slug === selectedTheme);
        if (themeConfig) {
          const radius = context.search_radius ?? 10000;
          const budgetKey = (context.budget as string) ?? "standard";
          const maxPrice = BUDGET_TO_PRICE_LEVEL[budgetKey] ?? 2;

          const radarResult = await checkAvailability(
            placesAdapter,
            { requireOpenNow: true, maxPriceLevel: maxPrice, minRating: PLACES_MIN_RATING },
            { location: context.location, radius, types: themeConfig.placeTypes, language: lang },
          );

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
      const maxTokens = ddState.mayFinalize ? 3000 : 2000;

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

      // Incrémenter le compteur
      if (profile && !isPrefetch) {
        supabase.from("profiles").update({ requests_count: quotaRequestsCount + 1, updated_at: new Date().toISOString() }).eq("id", user.id).then(() => {});
      }

      // Tracker les tokens
      const costUsd = computeCostUsd(usage, modelUsed === LLM_FINAL_MODEL);
      const callSessionId = session_id ?? crypto.randomUUID();
      supabase.from("llm_calls").insert({
        user_id: user.id, session_id: callSessionId,
        prompt_tokens: usage?.prompt_tokens ?? null,
        completion_tokens: usage?.completion_tokens ?? null,
        total_tokens: usage?.total_tokens ?? null,
        cost_usd: costUsd, model: modelUsed, choice: choice ?? null, is_prefetch: isPrefetch,
      }).then(() => {});

      // Parser la réponse
      let parsed: Record<string, unknown>;
      try {
        parsed = JSON.parse(content);
      } catch (parseError) {
        log.error("JSON PARSE FAILED", parseError);
        log.end(502);
        return jsonResponse({ error: "LLM returned invalid JSON" }, 502);
      }

      sanitizeParsed(parsed, log);

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
        ? ` ACTIVITÉS DÉJÀ REJETÉES (ne les repropose JAMAIS) : ${rejectedTitles.map(t => `"${t}"`).join(", ")}.`
        : "";
      messages.push({
        role: "system",
        content: `DIRECTIVE : L'utilisateur a rejeté la proposition précédente.${rejectedList} Tu DOIS proposer une activité COMPLÈTEMENT DIFFÉRENTE mais dans le thème "${selectedTheme}". Réponds avec statut "finalisé", phase "resultat" et une recommandation_finale concrète. Ne pose AUCUNE question.`,
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

      // Incrémenter et tracker
      if (profile && !isPrefetch) {
        supabase.from("profiles").update({ requests_count: quotaRequestsCount + 1, updated_at: new Date().toISOString() }).eq("id", user.id).then(() => {});
      }

      const callSessionId = session_id ?? crypto.randomUUID();
      supabase.from("llm_calls").insert({
        user_id: user.id, session_id: callSessionId,
        prompt_tokens: usage?.prompt_tokens ?? null, completion_tokens: usage?.completion_tokens ?? null,
        total_tokens: usage?.total_tokens ?? null,
        cost_usd: computeCostUsd(usage, hasBigModel), model: activeModel,
        choice: "reroll", is_prefetch: isPrefetch,
      }).then(() => {});

      let parsed: Record<string, unknown>;
      try {
        parsed = JSON.parse(content);
      } catch {
        log.error("JSON PARSE FAILED");
        log.end(502);
        return jsonResponse({ error: "LLM returned invalid JSON" }, 502);
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
