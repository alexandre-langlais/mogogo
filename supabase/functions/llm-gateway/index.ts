import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "jsr:@supabase/supabase-js@2";

const QUOTA_LIMITS: Record<string, number> = {
  free: 500,
  premium: 5000,
};

const LLM_API_URL = Deno.env.get("LLM_API_URL") ?? "http://localhost:11434/v1";
const LLM_MODEL = Deno.env.get("LLM_MODEL") ?? "gpt-oss:120b-cloud";
const LLM_API_KEY = Deno.env.get("LLM_API_KEY") ?? "";

// Modèle rapide optionnel pour les steps intermédiaires (questions A/B simples)
const LLM_FAST_API_URL = Deno.env.get("LLM_FAST_API_URL");
const LLM_FAST_MODEL = Deno.env.get("LLM_FAST_MODEL");
const LLM_FAST_API_KEY = Deno.env.get("LLM_FAST_API_KEY");

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

NEITHER (pivot, incrémente pivot_count) :
- depth>=2 : RESTE dans catégorie parente, alternatives RADICALEMENT DIFFÉRENTES dans le même thème.
- depth==1 : pivot latéral complet, CHANGE d'angle.

REROLL : même thématique/branche, activité DIFFÉRENTE. REFINE : 3 questions ciblées sur l'activité, puis finalisé.
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

FORMAT : JSON complet et valide uniquement. Rien avant ni après.`;

/**
 * Extract the first complete JSON object from a string.
 * Handles concatenated JSON objects (e.g. `{...}{...}{...}`).
 * Returns the substring of the first balanced `{...}` block, respecting strings.
 */
function extractFirstJSON(raw: string): string {
  const start = raw.indexOf("{");
  if (start === -1) return raw;

  let depth = 0;
  let inString = false;
  let escape = false;

  for (let i = start; i < raw.length; i++) {
    const ch = raw[i];

    if (escape) {
      escape = false;
      continue;
    }
    if (ch === "\\") {
      escape = true;
      continue;
    }
    if (ch === '"') {
      inString = !inString;
      continue;
    }
    if (inString) continue;

    if (ch === "{") depth++;
    else if (ch === "}") {
      depth--;
      if (depth === 0) {
        return raw.substring(start, i + 1);
      }
    }
  }

  // No balanced close found — return from start (will be repaired below)
  return raw.substring(start);
}

/**
 * Attempt to repair truncated JSON from LLM (e.g. when max_tokens cuts mid-string).
 * Handles: concatenated objects, unterminated strings, missing closing braces/brackets.
 */
function tryRepairJSON(raw: string): unknown {
  // First, try as-is
  try {
    return JSON.parse(raw);
  } catch {
    // Continue to repair
  }

  // Extract the first complete JSON object (handles concatenated objects)
  let repaired = extractFirstJSON(raw).trim();

  // Try parsing the extracted object
  try {
    return JSON.parse(repaired);
  } catch {
    // Continue to repair
  }

  // Remove any trailing incomplete key-value (e.g. `"foo": "bar` or `"foo": ` or `,"`)
  // by stripping back to the last complete value
  repaired = repaired.replace(/,\s*"[^"]*"\s*:\s*("([^"\\]|\\.)*)?$/, "");
  repaired = repaired.replace(/,\s*"[^"]*"\s*:?\s*$/, "");
  // Handle unterminated key name (e.g. trailing `,"` or `,"partialKey`)
  repaired = repaired.replace(/,\s*"[^"]*$/, "");

  // Close any unterminated string
  const quoteCount = (repaired.match(/(?<!\\)"/g) || []).length;
  if (quoteCount % 2 !== 0) {
    repaired += '"';
  }

  // Count open/close braces and brackets, append missing closers
  const opens = { "{": 0, "[": 0 };
  const closes: Record<string, keyof typeof opens> = { "}": "{", "]": "[" };
  for (const ch of repaired) {
    if (ch in opens) opens[ch as keyof typeof opens]++;
    if (ch in closes) opens[closes[ch]]--;
  }

  // Remove trailing comma before we close
  repaired = repaired.replace(/,\s*$/, "");

  for (let i = 0; i < opens["["]; i++) repaired += "]";
  for (let i = 0; i < opens["{"]; i++) repaired += "}";

  return JSON.parse(repaired);
}

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
    const { context, history, choice, preferences } = body;
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

    if (choice) {
      if (choice === "neither" && history && Array.isArray(history) && history.length > 0) {
        const { depth, chosenPath } = computeDepthAt(history, history.length - 1);
        // Inject a system directive BEFORE the user choice (LLMs follow system messages more strictly)
        messages.push({ role: "system", content: buildNeitherDirective(depth, chosenPath) });
        messages.push({ role: "user", content: `Choix : neither` });
      } else if (choice === "finalize") {
        messages.push({ role: "system", content: `DIRECTIVE SYSTÈME : L'utilisateur veut un résultat MAINTENANT. Tu DOIS répondre avec statut "finalisé", phase "resultat" et une recommandation_finale concrète basée sur les choix déjà faits dans l'historique. Ne pose AUCUNE question supplémentaire.` });
        messages.push({ role: "user", content: `Choix : finalize` });
      } else {
        messages.push({ role: "user", content: `Choix : ${choice}` });
      }
    }

    // max_tokens adaptatif : steps intermédiaires = concis, finalize/breakout = plus de place
    // Note : le LLM peut décider de finaliser spontanément, donc 800 minimum pour laisser
    // assez de place à une recommandation_finale complète même sur un step intermédiaire
    const isFinalStep = choice === "finalize" || choice === "reroll" || choice === "refine";
    const maxTokens = isFinalStep ? 1200 : 800;

    // Routing modèle : steps intermédiaires (avec choix A/B) → modèle rapide (si configuré)
    // Le premier appel (pas de choice) utilise toujours le modèle principal (prompt système complexe)
    // Note : le modèle rapide doit supporter response_format json_object (pas un modèle de raisonnement)
    const useFastModel = !isFinalStep && choice && choice !== "neither" && LLM_FAST_MODEL;
    const activeApiUrl = useFastModel ? (LLM_FAST_API_URL ?? LLM_API_URL) : LLM_API_URL;
    const activeModel = useFastModel ? LLM_FAST_MODEL! : LLM_MODEL;
    const activeApiKey = useFastModel ? (LLM_FAST_API_KEY ?? LLM_API_KEY) : LLM_API_KEY;

    const llmResponse = await fetch(`${activeApiUrl}/chat/completions`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        ...(activeApiKey ? { Authorization: `Bearer ${activeApiKey}` } : {}),
      },
      body: JSON.stringify({
        model: activeModel,
        messages,
        temperature: 0.7,
        max_tokens: maxTokens,
        response_format: { type: "json_object" },
      }),
    });

    if (!llmResponse.ok) {
      const errorText = await llmResponse.text();
      console.error("LLM API error:", errorText);
      return jsonResponse({ error: "LLM request failed" }, 502);
    }

    const llmData = await llmResponse.json();
    const content = llmData.choices?.[0]?.message?.content;

    if (!content) {
      return jsonResponse({ error: "Empty LLM response" }, 502);
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

    let parsed: unknown;
    try {
      // Warn if LLM returned concatenated JSON objects
      const trimmed = content.trim();
      if (trimmed.startsWith("{")) {
        const firstClose = extractFirstJSON(trimmed);
        if (firstClose.length < trimmed.length) {
          console.warn(`LLM returned concatenated JSON (${trimmed.length} chars, first object: ${firstClose.length} chars). Extracting first object.`);
        }
      }
      parsed = tryRepairJSON(content);

      // Normaliser les breakouts : le LLM renvoie parfois statut "en_cours" avec
      // un champ "breakout" au lieu de "finalisé" + "recommandation_finale"
      if (parsed && typeof parsed === "object") {
        const d = parsed as Record<string, unknown>;
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

    // On utilise les données du profile déjà chargé pour éviter un appel supplémentaire
    if (profile && typeof parsed === "object" && parsed !== null) {
      let balance = profile.plumes_balance;
      if (profile.last_refill_date < new Date().toISOString().split("T")[0]) {
        balance = 20;
      }
      (parsed as Record<string, unknown>)._plumes_balance =
        profile.plan === "premium" ? -1 : balance;
    }

    return jsonResponse(parsed);
  } catch (error) {
    console.error("Edge function error:", error);
    return jsonResponse({ error: "Internal server error" }, 500);
  }
});
