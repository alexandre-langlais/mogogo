import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "jsr:@supabase/supabase-js@2";
import { createProvider, OpenAIProviderError } from "./providers.ts";
import { getSystemPrompt, getPromptTier, LANGUAGE_INSTRUCTIONS, describeContext } from "../_shared/system-prompts.ts";
import { buildFirstQuestion, buildDiscoveryState, buildExplicitMessages } from "../_shared/discovery-state.ts";

const QUOTA_LIMITS: Record<string, number> = {
  free: 500,
  premium: 5000,
};

// --- Fast model (navigation funnel) ---
const LLM_API_URL = Deno.env.get("LLM_API_URL") ?? "http://localhost:11434/v1";
const LLM_MODEL = Deno.env.get("LLM_MODEL") ?? "gpt-oss:120b-cloud";
const LLM_API_KEY = Deno.env.get("LLM_API_KEY") ?? "";
const fastProvider = createProvider(LLM_API_URL, LLM_MODEL, LLM_API_KEY);

// --- Big model (finalisation) — optionnel, si absent le fast model fait tout ---
const LLM_FINAL_API_URL = Deno.env.get("LLM_FINAL_API_URL");
const LLM_FINAL_MODEL = Deno.env.get("LLM_FINAL_MODEL");
const LLM_FINAL_API_KEY = Deno.env.get("LLM_FINAL_API_KEY") ?? "";
const hasBigModel = !!(LLM_FINAL_API_URL && LLM_FINAL_MODEL);
const bigProvider = hasBigModel ? createProvider(LLM_FINAL_API_URL!, LLM_FINAL_MODEL!, LLM_FINAL_API_KEY) : null;

// --- Pricing per million tokens (for cost tracking in llm_calls) ---
const LLM_INPUT_PRICE_PER_M = parseFloat(Deno.env.get("LLM_INPUT_PRICE_PER_M") ?? "0");
const LLM_OUTPUT_PRICE_PER_M = parseFloat(Deno.env.get("LLM_OUTPUT_PRICE_PER_M") ?? "0");
const LLM_FINAL_INPUT_PRICE_PER_M = parseFloat(Deno.env.get("LLM_FINAL_INPUT_PRICE_PER_M") ?? "0");
const LLM_FINAL_OUTPUT_PRICE_PER_M = parseFloat(Deno.env.get("LLM_FINAL_OUTPUT_PRICE_PER_M") ?? "0");

function computeCostUsd(
  usage: { prompt_tokens: number; completion_tokens: number } | undefined,
  isBigModel: boolean,
): number | null {
  if (!usage) return null;
  const inputPrice = isBigModel ? LLM_FINAL_INPUT_PRICE_PER_M : LLM_INPUT_PRICE_PER_M;
  const outputPrice = isBigModel ? LLM_FINAL_OUTPUT_PRICE_PER_M : LLM_OUTPUT_PRICE_PER_M;
  if (inputPrice === 0 && outputPrice === 0) return null;
  return (usage.prompt_tokens * inputPrice + usage.completion_tokens * outputPrice) / 1_000_000;
}

// --- Minimum depth before finalization (configurable) ---
const MIN_DEPTH = Math.max(2, parseInt(Deno.env.get("MIN_DEPTH") ?? "4", 10));

// --- Cache LRU en mémoire pour le premier appel (TTL 10 min, max 100 entrées) ---
const CACHE_TTL_MS = 10 * 60 * 1000; // 10 minutes
const CACHE_MAX_ENTRIES = 100;

interface CacheEntry {
  response: unknown;
  timestamp: number;
}

const firstCallCache = new Map<string, CacheEntry>();

async function computeCacheKey(context: Record<string, unknown>, preferences: string | undefined, lang: string): Promise<string> {
  const input = JSON.stringify({ context, preferences: preferences ?? "", lang });
  const data = new TextEncoder().encode(input);
  const hashBuffer = await crypto.subtle.digest("SHA-256", data);
  const hashArray = Array.from(new Uint8Array(hashBuffer));
  return hashArray.map(b => b.toString(16).padStart(2, "0")).join("");
}

function getCachedResponse(key: string): unknown | null {
  const entry = firstCallCache.get(key);
  if (!entry) return null;
  if (Date.now() - entry.timestamp > CACHE_TTL_MS) {
    firstCallCache.delete(key);
    return null;
  }
  // Move to end (LRU freshness)
  firstCallCache.delete(key);
  firstCallCache.set(key, entry);
  return entry.response;
}

function setCachedResponse(key: string, response: unknown): void {
  // Evict oldest if at capacity
  if (firstCallCache.size >= CACHE_MAX_ENTRIES) {
    const oldest = firstCallCache.keys().next().value;
    if (oldest) firstCallCache.delete(oldest);
  }
  firstCallCache.set(key, { response, timestamp: Date.now() });
}


// Quota exceeded messages per language
const QUOTA_MESSAGES: Record<string, string> = {
  fr: "Tu as atteint ta limite mensuelle ! Passe au plan Premium ou attends le mois prochain.",
  en: "You've reached your monthly limit! Upgrade to Premium or wait until next month.",
  es: "¡Has alcanzado tu límite mensual! Pasa al plan Premium o espera al próximo mes.",
};

// Season names per language
const SEASON_NAMES: Record<string, Record<string, string>> = {
  fr: { spring: "printemps", summer: "été", autumn: "automne", winter: "hiver" },
  en: { spring: "spring", summer: "summer", autumn: "autumn", winter: "winter" },
  es: { spring: "primavera", summer: "verano", autumn: "otoño", winter: "invierno" },
};

// Temporal info templates per language
const TEMPORAL_TEMPLATES: Record<string, string> = {
  fr: "Info temporelle : l'activité est prévue pour le {dayName} {dayNum} {month} {year} (saison : {season}).",
  en: "Temporal info: the activity is planned for {dayName} {dayNum} {month} {year} (season: {season}).",
  es: "Info temporal: la actividad está prevista para el {dayName} {dayNum} de {month} de {year} (temporada: {season}).",
};

const LOCALE_MAP: Record<string, string> = {
  fr: "fr-FR",
  en: "en-US",
  es: "es-ES",
};

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers": "authorization, content-type, apikey, x-client-info",
};

function jsonResponse(body: unknown, status = 200) {
  return Response.json(body, { status, headers: corsHeaders });
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  if (req.method !== "POST") {
    return jsonResponse({ error: "Method not allowed" }, 405);
  }

  try {
    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    );

    // Auth obligatoire : vérifier le JWT
    const authHeader = req.headers.get("authorization");
    if (!authHeader) {
      return jsonResponse({ error: "Missing authorization header" }, 401);
    }

    const token = authHeader.replace("Bearer ", "");

    // Paralléliser auth + body parsing
    const [authResult, body] = await Promise.all([
      supabase.auth.getUser(token),
      req.json(),
    ]);

    const { data: authData, error: authError } = authResult;
    if (authError || !authData.user) {
      return jsonResponse({ error: "Invalid or expired token" }, 401);
    }

    const user = authData.user;
    const { context, history, choice, preferences, session_id, excluded_tags, device_id } = body;
    const lang = (context?.language as string) ?? "fr";
    const isNewSession = !history || !Array.isArray(history) || history.length === 0;

    // Charger le profil
    const { data: profile } = await supabase.from("profiles").select("*").eq("id", user.id).single();

    // Vérifier quotas
    let quotaRequestsCount = 0;
    if (profile) {
      const lastReset = new Date(profile.last_reset_date);
      const now = new Date();
      quotaRequestsCount = profile.requests_count;

      if (
        lastReset.getMonth() !== now.getMonth() ||
        lastReset.getFullYear() !== now.getFullYear()
      ) {
        quotaRequestsCount = 0;
        // Fire-and-forget: reset mensuel
        supabase
          .from("profiles")
          .update({ requests_count: 0, last_reset_date: now.toISOString() })
          .eq("id", user.id)
          .then(() => {});
      }

      const limit = QUOTA_LIMITS[profile.plan] ?? QUOTA_LIMITS.free;
      if (quotaRequestsCount >= limit) {
        return jsonResponse(
          {
            error: "quota_exceeded",
            message: QUOTA_MESSAGES[lang] ?? QUOTA_MESSAGES.en,
            plan: profile.plan,
            limit,
          },
          429,
        );
      }
    }

    // Limites côté serveur : max 1 reroll et 1 refine par session
    // Note : le client inclut le choix courant dans la dernière entrée de history,
    // donc on exclut la dernière entrée pour ne compter que les actions *passées*.
    if ((choice === "reroll" || choice === "refine") && history && Array.isArray(history)) {
      const pastHistory = history.slice(0, -1);
      const count = pastHistory.filter((e: { choice?: string }) => e.choice === choice).length;
      if (count >= 1) {
        return jsonResponse({ error: `${choice}_limit`, message: `Tu as déjà utilisé ton ${choice} pour cette session.` }, 429);
      }
    }

    // --- Routage DiscoveryState : tier du fast model ---
    const tier = getPromptTier(LLM_MODEL);
    const isPrefetch = body.prefetch === true;
    const isFirstCall = isNewSession && !choice;
    const isDirectFinal = choice === "finalize" || choice === "reroll";
    const useDiscoveryState = tier === "explicit" && !isDirectFinal && choice !== "refine";

    // --- Plume gate : pré-check (avant l'appel LLM) ---
    // On vérifie si cet appel va probablement produire un premier résultat finalisé.
    // Si oui et que l'utilisateur n'a plus de plumes → 402.
    if (device_id && typeof device_id === "string" && !isPrefetch && profile?.plan !== "premium") {
      const hadRefineOrReroll = Array.isArray(history) && history.some(
        (e: { choice?: string }) => e.choice === "refine" || e.choice === "reroll"
      );
      if (!hadRefineOrReroll) {
        let willFinalize = false;

        // Cas 1: finalize explicite
        if (choice === "finalize") {
          willFinalize = true;
        }
        // Cas 2: DiscoveryState prédit une finalisation
        else if (useDiscoveryState && history && Array.isArray(history) && history.length > 0) {
          const describedCtx = describeContext(context, lang);
          const excludedTagsArray = Array.isArray(excluded_tags) ? excluded_tags : undefined;
          const preCheckState = buildDiscoveryState(describedCtx, history, choice, lang, MIN_DEPTH, excludedTagsArray);
          willFinalize = preCheckState.willFinalize;
        }

        if (willFinalize) {
          const { data: plumesInfo } = await supabase.rpc("get_device_plumes_info", { p_device_id: device_id });
          const devicePremium = plumesInfo?.[0]?.is_premium === true;
          if (!devicePremium) {
            const plumesCount = plumesInfo?.[0]?.plumes_count ?? 0;
            if (plumesCount < 10) {
              return jsonResponse({ error: "no_plumes" }, 402);
            }
          }
        }
      }
    }

    // --- Court-circuit Q1 pré-construite (tier explicit, premier appel) ---
    if (tier === "explicit" && isFirstCall) {
      console.log("DiscoveryState: pre-built Q1 (no LLM call)");
      const firstQ = buildFirstQuestion(context, lang, preferences);
      firstQ._model_used = LLM_MODEL;
      // Fire-and-forget: incrémenter le compteur
      if (profile && !isPrefetch) {
        supabase
          .from("profiles")
          .update({ requests_count: quotaRequestsCount + 1, updated_at: new Date().toISOString() })
          .eq("id", user.id)
          .then(() => {});
      }
      // Fire-and-forget: tracker l'appel (0 tokens)
      const callSessionId = session_id ?? crypto.randomUUID();
      supabase.from("llm_calls").insert({
        user_id: user.id,
        session_id: callSessionId,
        prompt_tokens: 0,
        completion_tokens: 0,
        total_tokens: 0,
        cost_usd: 0,
        model: "pre-built-q1",
        choice: null,
        is_prefetch: isPrefetch,
      }).then(() => {});
      return jsonResponse(firstQ);
    }

    // Cache du premier appel (tiers non-explicit uniquement)
    let cacheKey: string | null = null;

    if (isFirstCall && !isPrefetch) {
      cacheKey = await computeCacheKey(context, preferences, lang);
      const cached = getCachedResponse(cacheKey);
      if (cached) {
        console.log("Cache hit for first call");
        (cached as Record<string, unknown>)._model_used = LLM_MODEL;
        // Fire-and-forget: incrémenter le compteur
        if (profile) {
          supabase
            .from("profiles")
            .update({ requests_count: quotaRequestsCount + 1, updated_at: new Date().toISOString() })
            .eq("id", user.id)
            .then(() => {});
        }
        return jsonResponse(cached);
      }
    }

    // Construire les messages pour le LLM
    let messages: Array<{ role: string; content: string }>;

    if (useDiscoveryState) {
      // --- Mode DiscoveryState : prompt simplifié + instruction serveur ---
      console.log("DiscoveryState: building explicit messages");
      const describedCtx = describeContext(context, lang);
      const excludedTagsArray = Array.isArray(excluded_tags) ? excluded_tags : undefined;
      const state = buildDiscoveryState(describedCtx, history, choice, lang, MIN_DEPTH, excludedTagsArray);
      messages = buildExplicitMessages(state, lang, LANGUAGE_INSTRUCTIONS[lang],
        preferences && typeof preferences === "string" && preferences.length > 0 ? preferences : undefined,
      );
    } else {
      // --- Mode classique : prompt complet + historique conversationnel ---
      messages = [
        { role: "system", content: getSystemPrompt(LLM_MODEL, MIN_DEPTH) },
      ];

      // Inject language instruction for non-French languages
      if (LANGUAGE_INSTRUCTIONS[lang]) {
        messages.push({ role: "system", content: LANGUAGE_INSTRUCTIONS[lang] });
      }

      if (context) {
        // Translate machine keys to human-readable descriptions for the LLM
        const describedContext = describeContext(context, lang);
        messages.push({
          role: "user",
          content: `Contexte utilisateur : ${JSON.stringify(describedContext)}`,
        });

        // Enrichissement temporel pour les dates précises
        if (context.timing && context.timing !== "now") {
          const date = new Date(context.timing + "T12:00:00");
          if (!isNaN(date.getTime())) {
            const locale = LOCALE_MAP[lang] ?? "en-US";
            const dayName = date.toLocaleDateString(locale, { weekday: "long" });
            const dayNum = date.getDate();
            const month = date.toLocaleDateString(locale, { month: "long" });
            const year = date.getFullYear();
            const m = date.getMonth();
            const seasonKey = m >= 2 && m <= 4 ? "spring" : m >= 5 && m <= 7 ? "summer" : m >= 8 && m <= 10 ? "autumn" : "winter";
            const season = SEASON_NAMES[lang]?.[seasonKey] ?? SEASON_NAMES.en[seasonKey];
            const template = TEMPORAL_TEMPLATES[lang] ?? TEMPORAL_TEMPLATES.en;
            const temporalMessage = template
              .replace("{dayName}", dayName)
              .replace("{dayNum}", String(dayNum))
              .replace("{month}", month)
              .replace("{year}", String(year))
              .replace("{season}", season);
            messages.push({
              role: "user",
              content: temporalMessage,
            });
          }
        }
      }

      // Injecter les preferences thematiques de l'utilisateur (Grimoire)
      if (preferences && typeof preferences === "string" && preferences.length > 0) {
        messages.push({ role: "system", content: preferences });
      }

      // Injecter les exclusions de session (tags dislikés)
      if (Array.isArray(excluded_tags) && excluded_tags.length > 0) {
        messages.push({ role: "system", content: `EXCLUSIONS SESSION : NE PAS proposer d'activités liées à : ${excluded_tags.join(", ")}.` });
        console.log("Dislike: user rejected tags", excluded_tags);
      }

      // Helper: compute depth — "neither" est transparent (pivot latéral)
      function computeDepthAt(hist: Array<{ choice?: string; response?: { options?: Record<string, string> } }>, endIdx: number): { depth: number; chosenPath: string[] } {
        let depth = 1;
        const chosenPath: string[] = [];
        for (let i = endIdx; i >= 0; i--) {
          const c = hist[i]?.choice;
          if (c === "A" || c === "B") {
            depth++;
            const opts = hist[i]?.response?.options;
            if (opts && opts[c]) {
              chosenPath.unshift(opts[c]);
            }
          } else if (c === "neither") {
            continue;
          } else {
            break;
          }
        }
        return { depth, chosenPath };
      }

      function buildNeitherDirective(depth: number, chosenPath: string[]): string {
        if (depth >= 2) {
          const parentTheme = chosenPath[chosenPath.length - 1] ?? chosenPath[0] ?? "ce thème";
          return `DIRECTIVE SYSTÈME : L'utilisateur a rejeté ces deux sous-options PRÉCISES, mais il aime toujours la catégorie parente "${parentTheme}". Tu DOIS rester dans ce thème et proposer deux alternatives RADICALEMENT DIFFÉRENTES au sein de "${parentTheme}". NE CHANGE PAS de catégorie. Profondeur = ${depth}, chemin = "${chosenPath.join(" > ")}".`;
        }
        return `DIRECTIVE SYSTÈME : Pivot complet. L'utilisateur rejette dès la racine. Change totalement d'angle d'attaque.`;
      }

      if (history && Array.isArray(history)) {
        for (let idx = 0; idx < history.length; idx++) {
          const entry = history[idx];
          // Historique compressé : on n'envoie que les champs essentiels (~100 chars vs ~500)
          const r = entry.response;
          const compressed: Record<string, unknown> = {
            q: r.question,
            A: r.options?.A,
            B: r.options?.B,
            phase: r.phase,
          };
          if (r.metadata?.current_branch) compressed.branch = r.metadata.current_branch;
          if (r.metadata?.depth) compressed.depth = r.metadata.depth;
          messages.push({ role: "assistant", content: JSON.stringify(compressed) });
          if (entry.choice) {
            messages.push({ role: "user", content: `Choix : ${entry.choice}` });
          }
        }
      }

      // Post-refine enforcement: si un "refine" a été fait récemment dans l'historique,
      // forcer 2-3 questions avant de finaliser
      if (history && Array.isArray(history) && choice && choice !== "refine") {
        let refineIdx = -1;
        for (let i = history.length - 1; i >= 0; i--) {
          if (history[i].choice === "refine") { refineIdx = i; break; }
        }
        if (refineIdx >= 0) {
          const questionsSinceRefine = history.length - 1 - refineIdx;
          if (questionsSinceRefine < 2) {
            const remaining = 2 - questionsSinceRefine;
            messages.push({ role: "system", content: `DIRECTIVE SYSTÈME : Affinage en cours (${questionsSinceRefine}/2 questions posées). Tu DOIS poser encore au minimum ${remaining} question(s) ciblée(s) sur l'activité (durée, ambiance, format, lieu...) avant de finaliser. Réponds OBLIGATOIREMENT avec statut "en_cours" et phase "questionnement".` });
          } else if (questionsSinceRefine >= 3) {
            messages.push({ role: "system", content: `DIRECTIVE SYSTÈME : Affinage terminé (${questionsSinceRefine} questions posées). Tu DOIS maintenant finaliser : statut "finalisé", phase "resultat", recommandation_finale concrète basée sur les réponses d'affinage. Ne pose AUCUNE question supplémentaire.` });
          }
        }
      }

      if (choice) {
        if (choice === "neither" && history && Array.isArray(history) && history.length > 0) {
          const { depth, chosenPath } = computeDepthAt(history, history.length - 1);
          // Inject a system directive BEFORE the user choice (LLMs follow system messages more strictly)
          messages.push({ role: "system", content: buildNeitherDirective(depth, chosenPath) });
          messages.push({ role: "user", content: `Choix : neither` });
        } else if (choice === "finalize") {
          messages.push({ role: "system", content: `DIRECTIVE SYSTÈME : L'utilisateur veut un résultat MAINTENANT. Tu DOIS répondre avec statut "finalisé", phase "resultat" et une recommandation_finale concrète basée sur les choix déjà faits dans l'historique. Ne pose AUCUNE question supplémentaire.` });
          messages.push({ role: "user", content: `Choix : finalize` });
        } else if (choice === "refine") {
          messages.push({ role: "system", content: `DIRECTIVE SYSTÈME : L'utilisateur veut AFFINER sa recommandation. Tu DOIS poser 2 à 3 questions ciblées sur l'activité recommandée (durée, ambiance, format, lieu précis...) AVANT de finaliser. Réponds avec statut "en_cours", phase "questionnement". NE finalise PAS maintenant.` });
          messages.push({ role: "user", content: `Choix : refine` });
        } else if (choice === "reroll") {
          const excludedStr = Array.isArray(excluded_tags) && excluded_tags.length
            ? ` Tags à EXCLURE absolument : ${excluded_tags.join(", ")}.`
            : "";
          messages.push({ role: "system", content: `DIRECTIVE SYSTÈME : L'utilisateur a rejeté la proposition précédente ("Pas pour moi").${excludedStr} Tu DOIS répondre avec statut "finalisé", phase "resultat" et une recommandation_finale DIFFÉRENTE mais qui reste dans la MÊME THÉMATIQUE générale que celle explorée pendant le funnel (les choix A/B de l'utilisateur définissent ses préférences). Propose une activité alternative concrète du même univers, tout en restant STRICTEMENT compatible avec son contexte (niveau d'énergie, budget, environnement). Ne pose AUCUNE question.` });
          messages.push({ role: "user", content: `Choix : reroll` });
        } else {
          messages.push({ role: "user", content: `Choix : ${choice}` });
        }
      }
    } // fin du mode classique

    // --- Routage dual-model ---
    const usesBigModel = isDirectFinal && hasBigModel;
    const activeProvider = usesBigModel ? bigProvider! : fastProvider;
    const activeModel = usesBigModel ? LLM_FINAL_MODEL! : LLM_MODEL;
    const maxTokens = isDirectFinal || usesBigModel ? 3000 : 2000;

    // Adapter le system prompt au tier du modèle actif
    if (usesBigModel) {
      messages[0] = { role: "system", content: getSystemPrompt(activeModel, MIN_DEPTH) };
    }

    let content: string;
    let usage: { prompt_tokens: number; completion_tokens: number; total_tokens: number } | undefined;
    let modelUsed = activeModel;
    console.log(`Calling LLM (${activeModel}) with ${messages.length} messages, ${maxTokens} max tokens`);
    try {
      const result = await activeProvider.call({ model: activeModel, messages, temperature: 0.7, maxTokens });
      content = result.content;
      usage = result.usage;
    } catch (err) {
      console.error("LLM API error:", err);
      const status = err instanceof OpenAIProviderError ? err.status : 502;
      return jsonResponse({ error: "LLM request failed" }, status >= 500 ? 502 : status);
    }

    // --- Interception : si le fast model finalise et qu'on a un big model, re-appeler ---
    if (hasBigModel && !isDirectFinal) {
      try {
        const fastParsed = JSON.parse(content);
        const isFastFinalized = fastParsed.statut === "finalisé" || fastParsed.phase === "breakout";
        if (isFastFinalized) {
          console.log(`Fast model finalized — intercepting with big model (${LLM_FINAL_MODEL})`);
          // Reconstruire les messages avec le system prompt adapté au big model
          const bigMessages = [...messages];
          bigMessages[0] = { role: "system", content: getSystemPrompt(LLM_FINAL_MODEL!, MIN_DEPTH) };
          bigMessages.push({
            role: "system",
            content: `DIRECTIVE SYSTÈME : Tu DOIS maintenant finaliser avec statut "finalisé", phase "resultat" et une recommandation_finale concrète. Base-toi sur tout l'historique de conversation pour proposer l'activité la plus pertinente.`,
          });
          try {
            const bigResult = await bigProvider!.call({ model: LLM_FINAL_MODEL!, messages: bigMessages, temperature: 0.7, maxTokens: 3000 });
            content = bigResult.content;
            usage = bigResult.usage;
            modelUsed = LLM_FINAL_MODEL!;
            console.log("Big model intercept succeeded");
          } catch (bigErr) {
            console.warn("Big model intercept failed, keeping fast model response:", bigErr);
            // Dégradation gracieuse : on garde la réponse du fast model
          }
        }
      } catch {
        // JSON parse failed on fast model content — will be caught below
      }
    }

    // Fire-and-forget: incrémenter le compteur APRÈS l'appel LLM (pas pour les prefetch)
    if (profile && !isPrefetch) {
      supabase
        .from("profiles")
        .update({
          requests_count: quotaRequestsCount + 1,
          updated_at: new Date().toISOString(),
        })
        .eq("id", user.id)
        .then(() => {});
    }

    // Fire-and-forget: tracker les tokens consommés dans llm_calls
    const callSessionId = session_id ?? crypto.randomUUID();
    supabase
      .from("llm_calls")
      .insert({
        user_id: user.id,
        session_id: callSessionId,
        prompt_tokens: usage?.prompt_tokens ?? null,
        completion_tokens: usage?.completion_tokens ?? null,
        total_tokens: usage?.total_tokens ?? null,
        cost_usd: computeCostUsd(usage, modelUsed === LLM_FINAL_MODEL),
        model: modelUsed,
        choice: choice ?? null,
        is_prefetch: isPrefetch,
      })
      .then(() => {});

    let parsed: unknown;
    try {
      parsed = JSON.parse(content);

      if (parsed && typeof parsed === "object") {
        const d = parsed as Record<string, unknown>;

        // Récupérer mogogo_message si manquant
        if (typeof d.mogogo_message !== "string" || !(d.mogogo_message as string).trim()) {
          if (typeof (d as any).message === "string" && (d as any).message.trim()) {
            d.mogogo_message = (d as any).message;
            console.warn("Recovered mogogo_message from 'message' field");
          } else if (typeof d.question === "string") {
            d.mogogo_message = "Hmm, laisse-moi réfléchir...";
            console.warn("Missing mogogo_message, using fallback");
          }
        }

        // Sanitiser les textes (strip markdown, valider options non-vides, tronquer)
        const stripMd = (t: string) => t
          .replace(/\*\*([^*]+)\*\*/g, "$1")
          .replace(/\*([^*]+)\*/g, "$1")
          .replace(/__([^_]+)__/g, "$1")
          .replace(/_([^_]+)_/g, "$1")
          .replace(/`([^`]+)`/g, "$1")
          .replace(/[\n\r]+/g, " ")
          .replace(/\s{2,}/g, " ")
          .trim();
        // Troncature intelligente : coupe au dernier mot entier avant maxLen
        const truncate = (t: string, maxLen: number) => {
          if (t.length <= maxLen) return t;
          // Couper au dernier espace avant la limite
          const cut = t.lastIndexOf(" ", maxLen - 1);
          return (cut > maxLen * 0.4 ? t.slice(0, cut) : t.slice(0, maxLen - 1)) + "…";
        };
        if (typeof d.mogogo_message === "string") d.mogogo_message = truncate(stripMd(d.mogogo_message), 120);
        if (typeof d.question === "string") d.question = truncate(stripMd(d.question), 100);
        // Fallback: créer les options si manquantes en phase en_cours (JSON tronqué)
        if (d.statut === "en_cours" && d.question && (!d.options || typeof d.options !== "object")) {
          d.options = { A: "Option A", B: "Option B" };
          console.warn("Missing options object, using fallback");
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
          // Filtrer les tags invalides
          const VALID_TAGS = new Set(["sport","culture","gastronomie","nature","detente","fete","creatif","jeux","musique","cinema","voyage","tech","social","insolite"]);
          if (Array.isArray(rec.tags)) {
            rec.tags = (rec.tags as string[]).filter(t => typeof t === "string" && VALID_TAGS.has(t));
          }
        }

        // Normaliser les breakouts : le LLM renvoie parfois statut "en_cours" avec
        // un champ "breakout" au lieu de "finalisé" + "recommandation_finale"
        if (d.phase === "breakout" && !d.recommandation_finale) {
          const breakoutArray = (d.breakout ?? d.breakout_options) as unknown;
          if (Array.isArray(breakoutArray) && breakoutArray.length > 0) {
            const items = breakoutArray as Array<{
              titre?: string; explication?: string; actions?: unknown[];
            }>;
            d.statut = "finalisé";
            d.recommandation_finale = {
              titre: items.map(b => b.titre ?? "").filter(Boolean).join(" / "),
              explication: items.map(b => b.explication ?? "").filter(Boolean).join(" "),
              actions: items.flatMap(b => Array.isArray(b.actions) ? b.actions : []),
              tags: [],
            };
            console.warn("Normalized breakout array into recommandation_finale");
          }
        }
        // Le LLM met parfois statut "en_cours" sur un breakout qui a déjà une recommandation_finale
        if (d.phase === "breakout" && d.statut === "en_cours" && d.recommandation_finale) {
          d.statut = "finalisé";
          console.warn("Normalized breakout statut from en_cours to finalisé");
        }

        // Garantir metadata
        if (!d.metadata || typeof d.metadata !== "object") {
          d.metadata = { pivot_count: 0, current_branch: "Racine", depth: 1 };
        }
      }
    } catch (parseError) {
      console.error("JSON parse failed. Raw LLM content:", content);
      console.error("Parse error:", parseError);
      return jsonResponse({ error: "LLM returned invalid JSON" }, 502);
    }

    // Sauvegarder dans le cache si c'est un premier appel
    if (cacheKey && isFirstCall && typeof parsed === "object" && parsed !== null) {
      setCachedResponse(cacheKey, parsed);
    }

    // Injecter le modèle utilisé pour l'indicateur côté client
    if (typeof parsed === "object" && parsed !== null) {
      (parsed as Record<string, unknown>)._model_used = modelUsed;
    }

    // Injecter les tokens consommés pour traçabilité côté client
    if (usage && typeof parsed === "object" && parsed !== null) {
      (parsed as Record<string, unknown>)._usage = usage;
    }

    // Fire-and-forget: consommer 10 plumes au premier résultat de la session
    // (pas sur reroll/refine/post-refine, pas pour les prefetch, pas pour les premium)
    if (device_id && typeof device_id === "string" && !isPrefetch && profile?.plan !== "premium") {
      const d = parsed as Record<string, unknown>;
      const hadRefineOrReroll = Array.isArray(history) && history.some(
        (e: { choice?: string }) => e.choice === "refine" || e.choice === "reroll"
      );
      const isFirstResult = d.statut === "finalisé" && !hadRefineOrReroll;
      if (isFirstResult) {
        supabase.rpc("consume_plumes", { p_device_id: device_id, p_amount: 10 }).then(({ error: rpcErr }) => {
          if (rpcErr) console.error("Failed to consume plumes:", rpcErr);
        });
      }
    }

    return jsonResponse(parsed);
  } catch (error) {
    console.error("Edge function error:", error);
    return jsonResponse({ error: "Internal server error" }, 500);
  }
});
