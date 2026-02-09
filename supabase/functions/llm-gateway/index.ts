import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "jsr:@supabase/supabase-js@2";

const QUOTA_LIMITS: Record<string, number> = {
  free: 500,
  premium: 5000,
};

const LLM_API_URL = Deno.env.get("LLM_API_URL") ?? "http://localhost:11434/v1";
const LLM_MODEL = Deno.env.get("LLM_MODEL") ?? "gpt-oss:120b-cloud";
const LLM_API_KEY = Deno.env.get("LLM_API_KEY") ?? "";

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

const SYSTEM_PROMPT = `Tu es Mogogo, un hibou magicien bienveillant qui aide à trouver LA bonne activité. Réponds TOUJOURS en JSON strict :
{
  "statut": "en_cours"|"finalisé",
  "phase": "questionnement"|"pivot"|"breakout"|"resultat",
  "mogogo_message": "1 phrase courte du hibou (max 100 chars)",
  "question": "Question courte (max 80 chars)",
  "options": {"A":"Label court","B":"Label court"},
  "recommandation_finale": {
    "titre": "Nom de l'activité",
    "explication": "2-3 phrases max",
    "actions": [{"type":"maps|web|steam|app_store|play_store|youtube|streaming|spotify","label":"Texte du bouton","query":"requête de recherche"}],
    "tags": ["slug1","slug2"]
  },
  "metadata": {"pivot_count":0,"current_branch":"Catégorie > Sous-catégorie > ...","depth":1}
}

Règles :

- **VARIABILITÉ DE L'ANGLE D'ATTAQUE (Q1)** :
  La première question NE DOIT PAS toujours être "Maison vs Sortie" ni toujours "Calme vs Énergie". Choisis un angle parmi ces 3 types selon la règle ci-dessous :
  1. **Logistique** : Ex: "Rester dans son cocon (film, cuisine, jeu...)" vs "Partir à l'aventure (sortie, balade, lieu inédit...)"
  2. **Vibe / Énergie** : Ex: "Se ressourcer dans le calme (lecture, spa, balade zen...)" vs "Se défouler / S'exciter (sport, escape game, karaoké...)"
  3. **Finalité** : Ex: "Créer quelque chose de ses mains (cuisine, DIY, dessin...)" vs "Consommer un divertissement (film, jeu, spectacle...)"
  RÈGLE DE SÉLECTION — utilise le contexte pour varier :
  * Social "Seul" ou "Couple" → angle **Finalité**
  * Social "Amis" → angle **Logistique**
  * Social "Famille" → angle **Vibe / Énergie**
  Si un pivot depth==1 survient, CHANGE d'angle (ex: si Q1 était Finalité, le pivot explore via Logistique ou Vibe). Si depth>=2, reste dans le même angle mais propose des sous-options différentes.
  Adapte les exemples au contexte (énergie, social, budget, environnement). Chaque option DOIT lister 3-4 exemples concrets entre parenthèses.

- **Environnement** :
  * "Intérieur" ne signifie PAS "rester à la maison". Cela signifie que l'utilisateur préfère un lieu couvert/abrité. Quand l'environnement est "Intérieur", CHAQUE paire d'options A/B doit proposer un MÉLANGE entre une activité à domicile ET une activité dans un lieu public couvert (cinéma, café, musée, bowling, escape game, bar à jeux...). Ne propose JAMAIS deux options qui sont toutes les deux "à la maison".
  * "Extérieur" = activités en plein air (parc, rando, terrasse, sport...).
  * "Peu importe" = pas de contrainte.

- **FACTEUR D'INSOLITE** (obligatoire) :
  Au moins UNE FOIS par session (dans les options A/B ou dans un pivot), tu DOIS proposer une activité "de niche" ou "insolite" pour sortir des sentiers battus. Exemples : géocaching, bar à jeux de société, atelier DIY/poterie, expo immersive, karaoké, cours d'impro, murder party, astronomie amateur, cani-rando, float tank, cours de cocktails, parcours pieds nus, lancer de hache, réalité virtuelle, escape game atypique, silent disco, food tour, atelier brassage de bière, herbier urbain, parkour, slackline... Évite de toujours retomber sur cinéma/resto/Netflix.

- **SUIVI DE BRANCHE** : à chaque réponse, mets à jour metadata.current_branch avec le chemin hiérarchique complet (ex: "Sortie > Cinéma > Comédie") et metadata.depth avec le niveau actuel (1 = racine). Quand l'utilisateur choisit A ou B, ajoute l'option choisie au chemin et incrémente depth. Quand un pivot depth>=2 survient, remonte d'un niveau dans le chemin (ex: "Sortie > Cinéma") et propose de nouvelles sous-options.
- Converge vite : 3-5 questions max avant de finaliser. Chaque question affine vers une activité CONCRÈTE et SPÉCIFIQUE (un titre, un lieu, un nom).
- IMPORTANT : chaque Q doit sous-diviser TOUTES les sous-catégories de l'option choisie. Ex: si Q1="Écran (film, série, jeu, musique)" est choisi, Q2 DOIT séparer "Visuel (film, série, jeu)" vs "Audio (musique, podcast)" — ne jamais oublier une sous-catégorie.
- Options A/B courtes (max 50 chars), contrastées, concrètes — inclure des exemples entre parenthèses
- **"neither" — LOGIQUE DE PIVOT CONTEXTUEL** (incrémente pivot_count) :
  * Maintiens TOUJOURS current_branch comme un chemin hiérarchique (ex: "Sortie > Cinéma > Film d'action") et depth = le niveau actuel (1 = question racine, 2 = sous-catégorie, 3+ = affinement).
  * **depth >= 2** (rejet d'un sous-nœud) : l'utilisateur rejette ces options PRÉCISES, PAS la catégorie parente. RESTE dans la catégorie parente et propose deux alternatives RADICALEMENT DIFFÉRENTES au sein de ce même thème. Ex: si l'utilisateur a choisi "Cinéma" puis rejette "Comédie vs Action", propose "Documentaire vs Film d'auteur" — ne quitte PAS le cinéma.
  * **depth == 1** (rejet dès la première question) : pivot latéral complet, CHANGE d'angle d'attaque (ex: si Q1 était Finalité, explore via Logistique ou Vibe).
  * Dans TOUS les cas, le pivot doit proposer des options CONTRASTÉES et non des variantes proches.
- "reroll" → l'utilisateur a vu la recommandation finale mais veut une AUTRE suggestion dans la MÊME thématique. La nouvelle proposition DOIT rester dans la même catégorie/branche que l'activité précédente (ex: si c'était "Faire des macarons", proposer une autre pâtisserie ou recette créative, PAS un escape game ou un sport). Ne repropose JAMAIS exactement la même activité. Varie le type spécifique tout en restant dans le même univers thématique (metadata.current_branch).
- "refine" → l'utilisateur veut AFFINER la recommandation proposée. Pose exactement 3 questions ciblées pour préciser les détails de l'activité (lieu exact, variante, ambiance, horaire...). Après ces 3 questions, donne la recommandation finale affinée (statut "finalisé"). Les questions doivent porter sur la catégorie déjà choisie, pas proposer autre chose.
- pivot_count >= 3 → breakout (Top 3). Les 3 activités du breakout doivent être VARIÉES et de catégories DIFFÉRENTES (ex: un sport, une activité créative, un divertissement culturel). Pas 3 variantes du même thème.
- En "finalisé" : titre = nom précis (titre de jeu, nom de resto, film exact...), explication = 2-3 phrases, et 1-3 actions pertinentes :
  * Lieu physique → "maps" (restaurant, parc, salle...)
  * Jeu PC → "steam" + "youtube" (trailer)
  * Jeu mobile → "app_store" + "play_store"
  * Film/série → "streaming" + "youtube" (bande-annonce)
  * Musique → "spotify"
  * Cours/tuto → "youtube" + "web"
  * Autre → "web"
- **Timing** : Le contexte contient un champ "timing" ("now" = maintenant, ou date ISO YYYY-MM-DD).
  * Si "now" ou absent : activités faisables immédiatement uniquement.
  * Si date précise : adapte à la saison, au jour de la semaine, aux événements saisonniers. Pas de ski en juillet, pas de plage en décembre.
- **FIABILITÉ** (CRITIQUE — tu n'as PAS accès à Internet ni aux données temps réel) :
  * LIEUX PHYSIQUES LOCAUX : Ne cite JAMAIS un établissement spécifique par son nom (restaurant, bar, spa, salle de sport, escape game...) sauf s'il s'agit d'un lieu ICONIQUE de notoriété nationale (Tour Eiffel, Jardin des Plantes de Paris, Puy du Fou...) ou d'une GRANDE CHAÎNE nationale (Pathé, UGC, MK2, Décathlon...). Recommande une CATÉGORIE précise : "un restaurant de ramen", "un escape game horreur", "un bowling", "un spa avec hammam". La query maps DOIT être générique pour trouver des résultats réels (ex: "bowling Nantes", "restaurant ramen Nantes", "spa hammam Nantes").
  * ÉVÉNEMENTS / SPECTACLES : Ne cite JAMAIS un spectacle, concert, exposition, festival ou événement spécifique avec une date. Tu ne connais PAS la programmation actuelle. Recommande le TYPE d'activité : "aller au cinéma voir un film d'action", "assister à un spectacle d'humour", "visiter une exposition". Utilise une action "web" avec une query de recherche pour que l'utilisateur trouve la programmation réelle (ex: "spectacle humour Nantes ce weekend").
  * CONTENU NUMÉRIQUE : Les titres de jeux vidéo, films, séries, livres, musiques CONNUS et ÉTABLIS sont OK. Ne jamais INVENTER de titre.
  * EN CAS DE DOUTE : préfère une recommandation descriptive et honnête plutôt qu'un nom précis potentiellement faux. L'utilisateur préfère "un bon restaurant japonais" avec un lien Maps fonctionnel plutôt qu'un nom de restaurant inventé.
- En "finalisé", ajoute un champ "tags" dans recommandation_finale : liste de 1-3 slugs thématiques parmi [sport, culture, gastronomie, nature, detente, fete, creatif, jeux, musique, cinema, voyage, tech, social, insolite]. Ces tags servent à enrichir le profil de préférences de l'utilisateur.
- Sois bref partout. Pas de texte hors JSON.
- **FORMAT** : Ta réponse DOIT être un JSON COMPLET et valide. Garde mogogo_message ≤ 100 chars, explication ≤ 200 chars, labels d'options ≤ 50 chars, query d'action ≤ 60 chars. N'ajoute JAMAIS de texte avant ou après le JSON.`;

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

  // Remove any trailing incomplete key-value (e.g. `"foo": "bar` or `"foo": `)
  // by stripping back to the last complete value
  repaired = repaired.replace(/,\s*"[^"]*"\s*:\s*("([^"\\]|\\.)*)?$/, "");
  repaired = repaired.replace(/,\s*"[^"]*"\s*:?\s*$/, "");

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
    const { data: authData, error: authError } = await supabase.auth.getUser(token);

    if (authError || !authData.user) {
      return jsonResponse({ error: "Invalid or expired token" }, 401);
    }

    const user = authData.user;

    // Lire le body de la requête (avant quota check pour extraire la langue)
    const body = await req.json();
    const { context, history, choice, preferences } = body;
    const lang = (context?.language as string) ?? "fr";

    // Vérifier quotas
    const { data: profile } = await supabase
      .from("profiles")
      .select("*")
      .eq("id", user.id)
      .single();

    if (profile) {
      // Reset mensuel si nécessaire
      const lastReset = new Date(profile.last_reset_date);
      const now = new Date();
      let requestsCount = profile.requests_count;

      if (
        lastReset.getMonth() !== now.getMonth() ||
        lastReset.getFullYear() !== now.getFullYear()
      ) {
        requestsCount = 0;
        await supabase
          .from("profiles")
          .update({ requests_count: 0, last_reset_date: now.toISOString() })
          .eq("id", user.id);
      }

      // Vérifier la limite
      const limit = QUOTA_LIMITS[profile.plan] ?? QUOTA_LIMITS.free;
      if (requestsCount >= limit) {
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

      // Incrémenter le compteur
      await supabase
        .from("profiles")
        .update({
          requests_count: requestsCount + 1,
          updated_at: now.toISOString(),
        })
        .eq("id", user.id);
    }

    // Vérifier et consommer une plume (uniquement au premier appel de session)
    const isNewSession = !history || !Array.isArray(history) || history.length === 0;
    if (isNewSession) {
      const { data: plumeOk, error: plumeError } = await supabase.rpc(
        "check_and_consume_plume",
        { p_user_id: user.id },
      );

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
        messages.push({ role: "assistant", content: JSON.stringify(entry.response) });
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
      } else {
        messages.push({ role: "user", content: `Choix : ${choice}` });
      }
    }

    // Appeler le LLM via API OpenAI-compatible
    const llmResponse = await fetch(`${LLM_API_URL}/chat/completions`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        ...(LLM_API_KEY ? { Authorization: `Bearer ${LLM_API_KEY}` } : {}),
      },
      body: JSON.stringify({
        model: LLM_MODEL,
        messages,
        temperature: 0.7,
        max_tokens: 1500,
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

    // Inclure le solde de plumes dans la réponse (non-breaking metadata)
    const { data: updatedProfile } = await supabase
      .from("profiles")
      .select("plumes_balance, plan, last_refill_date")
      .eq("id", user.id)
      .single();

    if (updatedProfile && typeof parsed === "object" && parsed !== null) {
      let balance = updatedProfile.plumes_balance;
      // Si la date de refill est passée, le solde effectif est 20 (sera refill au prochain appel)
      if (updatedProfile.last_refill_date < new Date().toISOString().split("T")[0]) {
        balance = 20;
      }
      (parsed as Record<string, unknown>)._plumes_balance =
        updatedProfile.plan === "premium" ? -1 : balance;
    }

    return jsonResponse(parsed);
  } catch (error) {
    console.error("Edge function error:", error);
    return jsonResponse({ error: "Internal server error" }, 500);
  }
});
