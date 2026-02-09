import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "jsr:@supabase/supabase-js@2";
import { createProvider, OpenAIProviderError } from "./providers.ts";

const QUOTA_LIMITS: Record<string, number> = {
  free: 500,
  premium: 5000,
};

const LLM_API_URL = Deno.env.get("LLM_API_URL") ?? "http://localhost:11434/v1";
const LLM_MODEL = Deno.env.get("LLM_MODEL") ?? "gpt-oss:120b-cloud";
const LLM_API_KEY = Deno.env.get("LLM_API_KEY") ?? "";
const llmProvider = createProvider(LLM_API_URL, LLM_MODEL, LLM_API_KEY);

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

// Machine key → human-readable descriptions per language (for LLM context)
const CONTEXT_DESCRIPTIONS: Record<string, Record<string, Record<string, string>>> = {
  social: {
    solo:    { fr: "Seul", en: "Alone", es: "Solo/a" },
    friends: { fr: "Amis", en: "Friends", es: "Amigos" },
    couple:  { fr: "Couple", en: "Couple", es: "Pareja" },
    family:  { fr: "Famille", en: "Family", es: "Familia" },
  },
  budget: {
    free:     { fr: "Gratuit", en: "Free", es: "Gratis" },
    budget:   { fr: "Économique", en: "Budget", es: "Económico" },
    standard: { fr: "Standard", en: "Standard", es: "Estándar" },
    luxury:   { fr: "Luxe", en: "Luxury", es: "Lujo" },
  },
  environment: {
    indoor:  { fr: "Intérieur", en: "Indoor", es: "Interior" },
    outdoor: { fr: "Extérieur", en: "Outdoor", es: "Exterior" },
    any_env: { fr: "Peu importe", en: "No preference", es: "Da igual" },
  },
};

function describeContext(context: Record<string, unknown>, lang: string): Record<string, unknown> {
  const described = { ...context };
  for (const field of ["social", "budget", "environment"] as const) {
    const key = context[field] as string;
    const mapping = CONTEXT_DESCRIPTIONS[field]?.[key];
    if (mapping) {
      described[field] = mapping[lang] ?? mapping.en ?? key;
    }
  }
  // Enrich children_ages with a human-readable description
  const ages = context.children_ages as { min: number; max: number } | undefined;
  if (ages && typeof ages.min === "number" && typeof ages.max === "number") {
    const templates: Record<string, string> = {
      fr: `Enfants de ${ages.min} à ${ages.max} ans`,
      en: `Children aged ${ages.min} to ${ages.max}`,
      es: `Niños de ${ages.min} a ${ages.max} años`,
    };
    described.children_ages = templates[lang] ?? templates.en;
  }
  return described;
}

// Language-specific instructions injected as additional system message
const LANGUAGE_INSTRUCTIONS: Record<string, string> = {
  en: "IMPORTANT: You MUST respond entirely in English. All fields (mogogo_message, question, options, recommandation_finale) must be in English. Keep the JSON keys in French as specified in the schema.",
  es: "IMPORTANT: You MUST respond entirely in Spanish. All fields (mogogo_message, question, options, recommandation_finale) must be in Spanish. Keep the JSON keys in French as specified in the schema.",
};

// Quota exceeded messages per language
const QUOTA_MESSAGES: Record<string, string> = {
  fr: "Tu as atteint ta limite mensuelle ! Passe au plan Premium ou attends le mois prochain.",
  en: "You've reached your monthly limit! Upgrade to Premium or wait until next month.",
  es: "¡Has alcanzado tu límite mensual! Pasa al plan Premium o espera al próximo mes.",
};

// No plumes messages per language
const NO_PLUMES_MESSAGES: Record<string, string> = {
  fr: "Tu n'as plus de plumes ! Reviens demain pour en recevoir de nouvelles, ou passe en Premium pour des plumes illimitées.",
  en: "You're out of feathers! Come back tomorrow for new ones, or upgrade to Premium for unlimited feathers.",
  es: "¡Te has quedado sin plumas! Vuelve mañana para recibir nuevas, o pásate a Premium para plumas ilimitadas.",
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

const SYSTEM_PROMPT = `Tu es Mogogo, hibou magicien bienveillant. Réponds TOUJOURS en JSON strict :
{"statut":"en_cours|finalisé","phase":"questionnement|pivot|breakout|resultat","mogogo_message":"≤100 chars","question":"≤80 chars","options":{"A":"≤50 chars","B":"≤50 chars"},"recommandation_finale":{"titre":"Nom","explication":"2-3 phrases max","actions":[{"type":"maps|web|steam|app_store|play_store|youtube|streaming|spotify","label":"Texte","query":"≤60 chars"}],"tags":["slug"]},"metadata":{"pivot_count":0,"current_branch":"Cat > Sous-cat","depth":1}}

ANGLE Q1 (varier obligatoirement) :
- Seul/Couple → Finalité : "Créer (cuisine, DIY, dessin...)" vs "Consommer (film, jeu, spectacle...)"
- Amis → Logistique : "Cocon (film, cuisine, jeu...)" vs "Aventure (sortie, balade, lieu inédit...)"
- Famille → Vibe : "Calme (lecture, spa, balade zen...)" vs "Défoulement (sport, escape game, karaoké...)"
Pivot depth==1 : CHANGE d'angle. Depth>=2 : même angle, sous-options différentes. Chaque option = 3-4 exemples concrets entre parenthèses.

ENVIRONNEMENT :
- "Intérieur" ≠ maison. = lieu couvert. Mixer domicile + lieu public couvert (cinéma, café, musée, bowling, escape game). JAMAIS 2 options "à la maison".
- "Extérieur" = plein air. "Peu importe" = libre.

INSOLITE (obligatoire 1x/session) : géocaching, bar à jeux, atelier DIY, expo immersive, karaoké, impro, murder party, astronomie, float tank, lancer de hache, VR, silent disco, food tour...

BRANCHE : metadata.current_branch = chemin hiérarchique complet, depth = niveau (1=racine). Choix A/B → ajouter au chemin, depth++.

CONVERGENCE : 3-5 questions max. Chaque Q sous-divise TOUTES les sous-catégories de l'option choisie. Options A/B courtes, contrastées, concrètes.

LONGUEURS (STRICT, jamais dépasser) : mogogo_message ≤100 chars, question ≤80 chars, options A/B ≤50 chars chacune. Les exemples concrets vont dans la question, PAS dans les options. Options = libellé court uniquement.

NEITHER (pivot, incrémente pivot_count) :
- depth>=2 : RESTE dans catégorie parente, alternatives RADICALEMENT DIFFÉRENTES dans le même thème.
- depth==1 : pivot latéral complet, CHANGE d'angle.

REROLL : même thématique/branche, activité DIFFÉRENTE. REFINE : au minimum 2 questions ciblées sur l'activité (durée, ambiance, format...), puis finalisé avec une recommandation affinée.
pivot_count>=3 → breakout Top 3 (catégories DIFFÉRENTES).

FINALISÉ : titre précis, 2-3 phrases, 1-3 actions pertinentes :
- Lieu → "maps", Jeu PC → "steam"+"youtube", Jeu mobile → "app_store"+"play_store", Film/série → "streaming"+"youtube", Musique → "spotify", Cours → "youtube"+"web", Autre → "web"
Tags : 1-3 parmi [sport,culture,gastronomie,nature,detente,fete,creatif,jeux,musique,cinema,voyage,tech,social,insolite]

ENFANTS : si children_ages, adapter STRICTEMENT à la tranche d'âge.
TIMING : "now"/absent = immédiat. Date ISO = adapter à saison/jour.

FIABILITÉ (CRITIQUE, pas d'accès Internet) :
- Lieux locaux : JAMAIS de nom spécifique sauf icônes nationales (Tour Eiffel) ou grandes chaînes (Pathé, UGC). Recommande une CATÉGORIE ("un restaurant de ramen"). Query maps générique ("bowling Nantes").
- Événements : JAMAIS de spectacle/expo spécifique avec date. Recommande le TYPE + action "web" pour programmation.
- Contenu numérique : titres CONNUS et ÉTABLIS uniquement.

FORMAT (CRITIQUE — non-respect = erreur) :
- Ta réponse DOIT être un JSON COMPLET et VALIDE. Rien avant ni après.
- TOUJOURS fermer toutes les accolades et crochets. JAMAIS de JSON tronqué.
- mogogo_message : TOUJOURS présent, 1 phrase courte ≤ 100 chars, texte brut sans formatage.
- question : texte brut ≤ 80 chars, JAMAIS de **gras**, *italique* ou markdown.
- options A/B : texte brut court ≤ 50 chars, JAMAIS vides, JAMAIS de markdown.
- query d'action : ≤ 60 chars, JAMAIS de "site:" ou opérateurs de recherche. Mots-clés simples uniquement.
- explication : ≤ 200 chars.`;

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
    const { context, history, choice, preferences, session_id } = body;
    const lang = (context?.language as string) ?? "fr";
    const isNewSession = !history || !Array.isArray(history) || history.length === 0;

    // Paralléliser quota check + plume check
    const [profileResult, plumeResult] = await Promise.all([
      supabase.from("profiles").select("*").eq("id", user.id).single(),
      isNewSession
        ? supabase.rpc("check_and_consume_plume", { p_user_id: user.id })
        : Promise.resolve({ data: true, error: null }),
    ]);

    const { data: profile } = profileResult;

    // Vérifier plumes (premier appel uniquement)
    if (isNewSession) {
      const { data: plumeOk, error: plumeError } = plumeResult;
      if (plumeError || plumeOk === false) {
        return jsonResponse(
          {
            error: "no_plumes",
            message: NO_PLUMES_MESSAGES[lang] ?? NO_PLUMES_MESSAGES.en,
          },
          403,
        );
      }
    }

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

    // Cache du premier appel : vérifier avant de construire les messages
    const isPrefetch = body.prefetch === true;
    const isFirstCall = isNewSession && !choice;
    let cacheKey: string | null = null;

    if (isFirstCall && !isPrefetch) {
      cacheKey = await computeCacheKey(context, preferences, lang);
      const cached = getCachedResponse(cacheKey);
      if (cached) {
        console.log("Cache hit for first call");
        // Add plumes balance to cached response
        if (profile && typeof cached === "object" && cached !== null) {
          let balance = profile.plumes_balance;
          if (profile.last_refill_date < new Date().toISOString().split("T")[0]) {
            balance = 20;
          }
          (cached as Record<string, unknown>)._plumes_balance =
            profile.plan === "premium" ? -1 : balance;
        }
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
    const messages: Array<{ role: string; content: string }> = [
      { role: "system", content: SYSTEM_PROMPT },
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

    // Helper: compute depth (consecutive A/B choices) at a given position in history
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

    // Post-refine enforcement: si un "refine" a été fait récemment dans l'historique
    // et que moins de 2 questions ont été posées depuis, forcer le LLM à continuer
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
        messages.push({ role: "system", content: `DIRECTIVE SYSTÈME : L'utilisateur veut AFFINER sa recommandation. Tu DOIS poser au minimum 2 questions ciblées sur l'activité recommandée (durée, ambiance, format, lieu précis...) AVANT de finaliser. Réponds avec statut "en_cours", phase "questionnement". NE finalise PAS maintenant.` });
        messages.push({ role: "user", content: `Choix : refine` });
      } else if (choice === "reroll") {
        messages.push({ role: "system", content: `DIRECTIVE SYSTÈME : L'utilisateur veut une AUTRE suggestion. Tu DOIS répondre avec statut "finalisé", phase "resultat" et une recommandation_finale DIFFÉRENTE de la précédente, mais dans la même thématique/branche. Ne pose AUCUNE question. Propose directement une activité alternative concrète.` });
        messages.push({ role: "user", content: `Choix : reroll` });
      } else {
        messages.push({ role: "user", content: `Choix : ${choice}` });
      }
    }

    // max_tokens adaptatif : steps intermédiaires = concis, finalize/breakout = plus de place
    const isFinalStep = choice === "finalize" || choice === "reroll";
    const maxTokens = isFinalStep ? 3000 : 2000;

    let content: string;
    let usage: { prompt_tokens: number; completion_tokens: number; total_tokens: number } | undefined;
    try {
      const result = await llmProvider.call({ model: LLM_MODEL, messages, temperature: 0.7, maxTokens });
      content = result.content;
      usage = result.usage;
    } catch (err) {
      console.error("LLM API error:", err);
      const status = err instanceof OpenAIProviderError ? err.status : 502;
      return jsonResponse({ error: "LLM request failed" }, status >= 500 ? 502 : status);
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
        model: LLM_MODEL,
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
      // Clone sans _plumes_balance pour le cache (sera ajouté à chaque hit)
      const toCache = { ...(parsed as Record<string, unknown>) };
      delete toCache._plumes_balance;
      setCachedResponse(cacheKey, toCache);
    }

    // Injecter le modèle utilisé pour l'indicateur côté client
    if (typeof parsed === "object" && parsed !== null) {
      (parsed as Record<string, unknown>)._model_used = LLM_MODEL;
    }

    // On utilise les données du profile déjà chargé pour éviter un appel supplémentaire
    if (profile && typeof parsed === "object" && parsed !== null) {
      let balance = profile.plumes_balance;
      if (profile.last_refill_date < new Date().toISOString().split("T")[0]) {
        balance = 20;
      }
      (parsed as Record<string, unknown>)._plumes_balance =
        profile.plan === "premium" ? -1 : balance;
    }

    // Injecter les tokens consommés pour traçabilité côté client
    if (usage && typeof parsed === "object" && parsed !== null) {
      (parsed as Record<string, unknown>)._usage = usage;
    }

    return jsonResponse(parsed);
  } catch (error) {
    console.error("Edge function error:", error);
    return jsonResponse({ error: "Internal server error" }, 500);
  }
});
