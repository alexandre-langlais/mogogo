/**
 * Source unique pour les system prompts Mogogo.
 *
 * Trois tiers de prompt selon la taille/capacité du modèle :
 * - compact  : gros modèles (70B+), prompt condensé (~1800 chars, -40%)
 * - standard : modèles moyens (14-70B), prompt actuel (~3000 chars)
 * - explicit : petits modèles (<14B), prompt détaillé + exemples (~3800 chars, +25%)
 */

// ── Types ──────────────────────────────────────────────────────────────────

export type PromptTier = "compact" | "standard" | "explicit";

// ── Données i18n partagées ─────────────────────────────────────────────────

/** Machine key → human-readable descriptions per language (for LLM context) */
export const CONTEXT_DESCRIPTIONS: Record<string, Record<string, Record<string, string>>> = {
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

/** Language-specific instructions injected as additional system message */
export const LANGUAGE_INSTRUCTIONS: Record<string, string> = {
  en: "IMPORTANT: You MUST respond entirely in English. All fields (mogogo_message, question, options, recommandation_finale) must be in English. Keep the JSON keys in French as specified in the schema.",
  es: "IMPORTANT: You MUST respond entirely in Spanish. All fields (mogogo_message, question, options, recommandation_finale) must be in Spanish. Keep the JSON keys in French as specified in the schema.",
};

/** Translate machine keys to human-readable descriptions for the LLM */
export function describeContext(context: Record<string, unknown>, lang: string): Record<string, unknown> {
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

// ── Mapping modèle → tier ──────────────────────────────────────────────────

/** Surcharges explicites pour des modèles spécifiques */
const TIER_OVERRIDES: Record<string, PromptTier> = {
  "gpt-4o-mini": "explicit",
  "gpt-4.1-mini": "explicit",
  "gpt-4.1-nano": "explicit",
  "gemini-2.0-flash-lite": "explicit",
  "gemini-2.5-flash-lite": "explicit",
  "gpt-4o": "compact",
  "gpt-4.1": "compact",
  "gpt-4.5": "compact",
  "claude-sonnet-4-5": "compact",
  "claude-opus-4-6": "compact",
};

/** Patterns regex ordonnés : premier match gagne */
const TIER_PATTERNS: Array<[RegExp, PromptTier]> = [
  // Gros modèles → compact
  [/\b(70b|72b|110b|120b|405b)\b/i, "compact"],
  [/llama.*70b/i, "explicit"],
  [/qwen.*72b/i, "compact"],
  [/deepseek.*(v3|r1|67b|236b)/i, "compact"],
  [/command-r-plus/i, "compact"],
  [/gemini.*pro/i, "compact"],
  [/claude/i, "compact"],
  [/gpt-4o(?!-mini)/i, "compact"],
  // Petits modèles → explicit
  [/\b([1-9]b|[1-9]\.\d+b|1[0-3]b)\b/i, "explicit"],
  [/\b(mini|nano|tiny|small|lite)\b/i, "explicit"],
  [/flash-lite/i, "explicit"],
  [/phi-?[34]/i, "explicit"],
  [/gemma.*[27]b/i, "explicit"],
  [/mistral.*7b/i, "explicit"],
  [/llama.*(7b|8b|3b|1b)/i, "explicit"],
  [/qwen.*(7b|14b|4b|1b|0\.5b)/i, "explicit"],
];

/** Normalise un modelId en retirant provider prefix et suffixes */
function normalizeModelId(modelId: string): string {
  // Retirer préfixe provider : "google/gemini-flash" → "gemini-flash"
  let normalized = modelId.includes("/") ? modelId.split("/").pop()! : modelId;
  // Retirer suffixes courants : ":free", ":cloud", "-instruct", "-chat"
  normalized = normalized.replace(/:(free|cloud|online|extended)\b/gi, "");
  return normalized;
}

/** Détermine le tier de prompt pour un modèle donné */
export function getPromptTier(modelId: string): PromptTier {
  const normalized = normalizeModelId(modelId);

  // 1. Surcharges explicites
  for (const [key, tier] of Object.entries(TIER_OVERRIDES)) {
    if (normalized.toLowerCase().startsWith(key.toLowerCase())) return tier;
  }

  // 2. Patterns regex
  for (const [pattern, tier] of TIER_PATTERNS) {
    if (pattern.test(normalized)) return tier;
  }

  // 3. Default
  return "standard";
}

// ── Sections du prompt ─────────────────────────────────────────────────────

const SECTION_IDENTITY = `Tu es Mogogo, hibou magicien bienveillant. Réponds TOUJOURS en JSON strict :
{"statut":"en_cours|finalisé","phase":"questionnement|pivot|breakout|resultat","mogogo_message":"≤100 chars","question":"≤80 chars","options":{"A":"≤50 chars","B":"≤50 chars"},"recommandation_finale":{"titre":"Nom","explication":"2-3 phrases max","actions":[{"type":"maps|web|steam|play_store|youtube|streaming|spotify","label":"Texte","query":"≤60 chars"}],"tags":["slug"]},"metadata":{"pivot_count":0,"current_branch":"Cat > Sous-cat","depth":1}}`;

const SECTION_ANGLE_Q1 = `
ANGLE Q1 (varier obligatoirement) :
- Seul/Couple → Finalité : "Créer (cuisine, DIY, dessin...)" vs "Consommer (film, jeu, spectacle...)"
- Amis → Logistique : "Cocon (film, cuisine, jeu...)" vs "Aventure (sortie, balade, lieu inédit...)"
- Famille → Vibe : "Calme (lecture, spa, balade zen...)" vs "Défoulement (sport, escape game, karaoké...)"
Pivot depth==1 : CHANGE d'angle. Depth>=2 : même angle, sous-options différentes. Chaque option = 3-4 exemples concrets entre parenthèses.`;

const SECTION_ENVIRONMENT = `
ENVIRONNEMENT :
- "Intérieur" ≠ maison. = lieu couvert. Mixer domicile + lieu public couvert (cinéma, café, musée, bowling, escape game). JAMAIS 2 options "à la maison".
- "Extérieur" = plein air. "Peu importe" = libre.`;

const SECTION_INSOLITE = `
INSOLITE (obligatoire 1x/session) : géocaching, bar à jeux, atelier DIY, expo immersive, karaoké, impro, murder party, astronomie, float tank, lancer de hache, VR, silent disco, food tour...`;

const SECTION_BRANCH = `
BRANCHE : metadata.current_branch = chemin hiérarchique complet, depth = niveau (1=racine). Choix A/B → ajouter au chemin, depth++.`;

const SECTION_NEITHER = `
NEITHER (pivot, incrémente pivot_count) :
- depth>=2 : RESTE dans catégorie parente, alternatives RADICALEMENT DIFFÉRENTES dans le même thème.
- depth==1 : pivot latéral complet, CHANGE d'angle.`;

const SECTION_FINALIZED = `
FINALISÉ : titre précis, 2-3 phrases, 1-3 actions pertinentes :
- Lieu → "maps", Jeu PC → "steam"+"youtube", Jeu/app mobile → "play_store" (Android uniquement, JAMAIS "app_store"), Film/série → "streaming"+"youtube", Musique → "spotify", Cours → "youtube"+"web", Autre → "web"
PLATEFORME : app Android uniquement. JAMAIS proposer de lien App Store / iOS. Pour les apps et jeux mobiles, utiliser UNIQUEMENT "play_store".
Tags : 1-3 parmi [sport,culture,gastronomie,nature,detente,fete,creatif,jeux,musique,cinema,voyage,tech,social,insolite]`;

const SECTION_CHILDREN_TIMING = `
ENFANTS : si children_ages, adapter STRICTEMENT à la tranche d'âge.
TIMING : "now"/absent = immédiat. Date ISO = adapter à saison/jour.`;

const SECTION_RELIABILITY = `
FIABILITÉ (CRITIQUE, pas d'accès Internet) :
- Lieux locaux : JAMAIS de nom spécifique sauf icônes nationales (Tour Eiffel) ou grandes chaînes (Pathé, UGC). Recommande une CATÉGORIE ("un restaurant de ramen"). Query maps générique ("bowling Nantes").
- Événements : JAMAIS de spectacle/expo spécifique avec date. Recommande le TYPE + action "web" pour programmation.
- Contenu numérique : titres CONNUS et ÉTABLIS uniquement.`;

// ── Sections différenciées par tier ────────────────────────────────────────

function getConvergenceSection(tier: PromptTier, minDepth: number): string {
  const minQuestions = minDepth - 1;
  const maxQuestions = minDepth + 1;
  if (tier === "compact") {
    return `
CONVERGENCE : ${minQuestions}-${maxQuestions} questions avant de finaliser. Chaque Q sous-divise l'option choisie. Options A/B courtes, contrastées, concrètes.`;
  }
  if (tier === "explicit") {
    const responseLines = Array.from({ length: minQuestions }, (_, i) => `Réponse ${i + 1} = en_cours.`).join(" ");
    const countCheck = Array.from({ length: minQuestions }, (_, i) => String(i)).join(", ");
    return `
CONVERGENCE (RÈGLE ABSOLUE) :
- Tes ${minQuestions} PREMIÈRES réponses DOIVENT avoir statut "en_cours" et poser une question.
- ${responseLines}
- Tu ne peux répondre "finalisé" QU'À PARTIR de ta ${minDepth}ème réponse (minimum).
- Compte tes messages "assistant" dans l'historique. Si tu en vois ${countCheck} : tu DOIS répondre en_cours.
- MAXIMUM ${maxQuestions} questions au total avant de finaliser.
Chaque question sous-divise l'option choisie. Options A/B courtes, contrastées, concrètes.`;
  }
  // standard
  return `
CONVERGENCE (STRICT) : MINIMUM ${minQuestions} questions AVANT de finaliser, MAXIMUM ${maxQuestions}. Si depth < ${minQuestions}, tu DOIS poser une nouvelle question (statut "en_cours"). JAMAIS statut "finalisé" ni phase "resultat" quand depth < ${minQuestions}. Chaque Q sous-divise TOUTES les sous-catégories de l'option choisie. Options A/B courtes, contrastées, concrètes.`;
}

function getLengthsSection(tier: PromptTier): string {
  if (tier === "compact") {
    return `
LONGUEURS : mogogo_message ≤100 chars, question ≤80 chars, options A/B ≤50 chars. Exemples dans la question, PAS dans les options.`;
  }
  if (tier === "explicit") {
    return `
LONGUEURS (STRICT, jamais dépasser) : mogogo_message ≤100 chars, question ≤80 chars, options A et B ≤50 chars chacune.
Les exemples concrets vont dans la question, PAS dans les options. Options = libellé court uniquement.
OBLIGATION : les deux options A ET B doivent TOUJOURS contenir du texte (min 5 chars). JAMAIS de champ vide ou "".`;
  }
  // standard
  return `
LONGUEURS (STRICT, jamais dépasser) : mogogo_message ≤100 chars, question ≤80 chars, options A/B ≤50 chars chacune. Les exemples concrets vont dans la question, PAS dans les options. Options = libellé court uniquement.`;
}

function getRerollSection(tier: PromptTier): string {
  if (tier === "compact") {
    return `
REROLL : répondre IMMÉDIATEMENT avec statut "finalisé", phase "resultat", recommandation DIFFÉRENTE. JAMAIS reposer de questions.
REFINE : 2+ questions ciblées (durée, ambiance, format...), puis finalisé avec recommandation affinée.
pivot_count>=3 → breakout Top 3 (catégories DIFFÉRENTES).`;
  }
  if (tier === "explicit") {
    return `
REROLL (STRICT) : Tu DOIS répondre IMMÉDIATEMENT avec statut "finalisé", phase "resultat" et une recommandation_finale. L'activité DOIT être FONDAMENTALEMENT DIFFÉRENTE de toutes les précédentes : CHANGE le TYPE d'activité (ex: si atelier DIY → passe à un escape game ou un concert, PAS un autre atelier). JAMAIS reposer de questions. JAMAIS reproposer une variante du même concept.
REFINE : au minimum 2 questions ciblées sur l'activité (durée, ambiance, format...), puis finalisé avec une recommandation affinée.
pivot_count>=3 → breakout Top 3 (catégories DIFFÉRENTES).`;
  }
  // standard
  return `
REROLL (STRICT) : Tu DOIS répondre IMMÉDIATEMENT avec statut "finalisé", phase "resultat" et une recommandation_finale. L'activité DOIT être FONDAMENTALEMENT DIFFÉRENTE de toutes les précédentes : CHANGE le TYPE d'activité (ex: si atelier DIY → passe à un escape game ou un concert, PAS un autre atelier). JAMAIS reposer de questions. JAMAIS reproposer une variante du même concept.
REFINE : au minimum 2 questions ciblées sur l'activité (durée, ambiance, format...), puis finalisé avec une recommandation affinée.
pivot_count>=3 → breakout Top 3 (catégories DIFFÉRENTES).`;
}

function getFormatSection(tier: PromptTier): string {
  if (tier === "compact") {
    return `
FORMAT (CRITIQUE) : JSON strict uniquement. Rien avant ni après. TOUJOURS fermer accolades/crochets. mogogo_message toujours présent, texte brut sans markdown. query ≤60 chars, pas d'opérateurs. explication ≤200 chars.`;
  }
  if (tier === "explicit") {
    return `
FORMAT (CRITIQUE — non-respect = erreur) :
- Commence DIRECTEMENT par { — JAMAIS de texte, explication ou markdown avant le JSON.
- Ta réponse DOIT être un JSON COMPLET et VALIDE. Rien avant ni après.
- TOUJOURS fermer toutes les accolades et crochets. Vérifie : la réponse DOIT se terminer par }
- mogogo_message : TOUJOURS présent, 1 phrase courte ≤ 100 chars, texte brut sans formatage.
- question : texte brut ≤ 80 chars, JAMAIS de **gras**, *italique* ou markdown.
- options A/B : texte brut court ≤ 50 chars, JAMAIS vides, JAMAIS de markdown.
- query d'action : ≤ 60 chars, mots-clés simples uniquement.
- explication : ≤ 200 chars. Sois CONCIS pour ne pas tronquer le JSON.

Exemple en_cours :
{"statut":"en_cours","phase":"questionnement","mogogo_message":"Chouette, explorons ça !","question":"Plutôt en intérieur ou en plein air ?","options":{"A":"Intérieur (ciné, musée, café)","B":"Extérieur (parc, rando, marché)"},"metadata":{"pivot_count":0,"current_branch":"Racine","depth":1}}

Exemple finalisé :
{"statut":"finalisé","phase":"resultat","mogogo_message":"Voilà ce que je te propose !","recommandation_finale":{"titre":"Bowling entre amis","explication":"Une soirée bowling conviviale.","actions":[{"type":"maps","label":"Trouver un bowling","query":"bowling"}],"tags":["jeux","social"]},"metadata":{"pivot_count":0,"current_branch":"Sortie > Bowling","depth":4}}`;
  }
  // standard
  return `
FORMAT (CRITIQUE — non-respect = erreur) :
- Ta réponse DOIT être un JSON COMPLET et VALIDE. Rien avant ni après.
- TOUJOURS fermer toutes les accolades et crochets. JAMAIS de JSON tronqué.
- mogogo_message : TOUJOURS présent, 1 phrase courte ≤ 100 chars, texte brut sans formatage.
- question : texte brut ≤ 80 chars, JAMAIS de **gras**, *italique* ou markdown.
- options A/B : texte brut court ≤ 50 chars, JAMAIS vides, JAMAIS de markdown.
- query d'action : ≤ 60 chars, JAMAIS de "site:" ou opérateurs de recherche. Mots-clés simples uniquement.
- explication : ≤ 200 chars.`;
}

// ── Rappel final (explicit uniquement) ─────────────────────────────────────

function getRecallExplicitSection(minDepth: number): string {
  const minQuestions = minDepth - 1;
  const responseLines = Array.from({ length: minQuestions }, (_, i) => `Réponse ${i + 1} = en_cours.`).join(" ");
  return `

=== RAPPEL CRITIQUE (relis avant CHAQUE réponse) ===
1. JSON UNIQUEMENT. Commence par { et termine par }. AUCUN texte autour.
2. ${responseLines} Finalisé possible seulement à partir de la réponse ${minDepth}.
3. Champs texte NON-VIDES et courts. mogogo_message ≤100, question ≤80, options A et B ≤50 chacune.`;
}

// ── Assemblage ─────────────────────────────────────────────────────────────

function buildPrompt(tier: PromptTier, minDepth: number): string {
  const sections = [
    SECTION_IDENTITY,
    SECTION_ANGLE_Q1,
    SECTION_ENVIRONMENT,
  ];

  // INSOLITE omis pour compact
  if (tier !== "compact") {
    sections.push(SECTION_INSOLITE);
  }

  sections.push(SECTION_BRANCH);
  sections.push(getConvergenceSection(tier, minDepth));
  sections.push(getLengthsSection(tier));
  sections.push(SECTION_NEITHER);
  sections.push(getRerollSection(tier));
  sections.push(SECTION_FINALIZED);
  sections.push(SECTION_CHILDREN_TIMING);
  sections.push(SECTION_RELIABILITY);
  sections.push(getFormatSection(tier));

  // Rappel critique en fin de prompt pour les petits modèles
  if (tier === "explicit") {
    sections.push(getRecallExplicitSection(minDepth));
  }

  return sections.join("\n");
}

// Cache des prompts construits (clé = tier:minDepth)
const promptCache = new Map<string, string>();

function getPromptForTier(tier: PromptTier, minDepth: number): string {
  const key = `${tier}:${minDepth}`;
  if (!promptCache.has(key)) {
    promptCache.set(key, buildPrompt(tier, minDepth));
  }
  return promptCache.get(key)!;
}

/** Retourne le system prompt adapté au modèle */
export function getSystemPrompt(modelId: string, minDepth = 4): string {
  const tier = getPromptTier(modelId);
  return getPromptForTier(tier, minDepth);
}
