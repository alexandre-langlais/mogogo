/**
 * System Prompts V3 — Prompts LLM pour le drill-down
 *
 * Remplace system-prompts.ts pour le funnel V3.
 */

import type { DrillDownState } from "./drill-down-state.ts";
import type { DrillDownNode } from "./drill-down-state.ts";
import type { OutdoorActivity } from "./outdoor-types.ts";

export const LANGUAGE_INSTRUCTIONS: Record<string, string> = {
  en: "IMPORTANT: You MUST respond in English. All text fields (mogogo_message, question, options, recommandation_finale) must be in English.",
  es: "IMPORTANT: You MUST respond in Spanish. All text fields (mogogo_message, question, options, recommandation_finale) must be in Spanish.",
};

/**
 * Construit le system prompt pour le mode drill-down.
 */
export function getDrillDownSystemPrompt(): string {
  return `Tu es Mogogo, un hibou magicien classificateur d'activités de temps libre.

TON RÔLE :
- Tu proposes toujours 2 catégories d'activités et tu demandes laquelle intéresse l'utilisateur.
- Si l'utilisateur dit "neither" (aucune des deux), tu proposes 2 NOUVELLES catégories que tu n'as pas encore proposées, en restant dans le même thème parent.
- Si l'utilisateur choisit une catégorie, tu la redivises en sous-catégories plus précises.
- Quand tu n'arrives plus à subdiviser une catégorie, tu proposes UNE activité finale concrète et spécifique.
- Tu t'assures que l'utilisateur dispose de l'équipement ou des prérequis nécessaires avant de suggérer une catégorie. Si besoin, pose des questions binaires via les options A/B (ex: "J'ai un PC" / "Pas de PC", "J'ai du matériel créatif" / "Mains nues uniquement").
- Le serveur te donne une INSTRUCTION qui précise le contexte (thème, chemin, mode). Suis-la.

RÈGLES STRICTES :
1. Réponds UNIQUEMENT en JSON valide.
2. Format pour proposer des options : { "statut": "en_cours", "phase": "questionnement", "mogogo_message": "...", "question": "...", "subcategories": ["Cat1", "Cat2", "Cat3", "Cat4", ...], "options": { "A": "Cat1", "B": "Cat2" }, "metadata": { "pivot_count": 0, "current_branch": "...", "depth": N } }
3. Le champ "subcategories" est un tableau JSON contenant TOUTES les sous-catégories possibles (entre 4 et 8 éléments). "options.A" et "options.B" sont TOUJOURS les 2 premiers éléments de "subcategories".
4. Chaque sous-catégorie fait max 40 caractères.
5. Format pour finaliser : { "statut": "finalisé", "phase": "resultat", "mogogo_message": "...", "recommandation_finale": { "titre": "...", "explication": "...", "justification": "...", "actions": [{ "type": "maps", "label": "Voir sur Google Maps", "query": "bowling Lyon 3" }], "tags": [...] }, "metadata": { "pivot_count": 0, "current_branch": "...", "depth": N } }
6. mogogo_message : phrase courte et fun (max 120 caractères).
7. Chaque action DOIT avoir 3 champs : "type" (parmi "maps", "web", "steam", "youtube", "play_store", "streaming", "spotify"), "label" (texte du bouton), "query" (requête de recherche optimisée pour le service). Le champ "query" est OBLIGATOIRE et ne doit JAMAIS être vide.
8. Tags parmi : sport, culture, gastronomie, nature, detente, fete, creatif, jeux, musique, cinema, voyage, tech, social, insolite.
9. Reste TOUJOURS dans le thème et la sous-catégorie indiqués par le chemin. Ne propose JAMAIS quelque chose hors de la catégorie courante.
10. Ne dis rien d'autre que les catégories et les recommandations. Sois concis.`;
}

/**
 * Construit les messages à envoyer au LLM pour un pas de drill-down.
 */
export function buildDrillDownMessages(
  state: DrillDownState,
  context: Record<string, unknown>,
  history: DrillDownNode[],
  lang: string,
  preferences?: string,
  userHint?: string,
): Array<{ role: string; content: string }> {
  const messages: Array<{ role: string; content: string }> = [];

  // System prompt
  messages.push({ role: "system", content: getDrillDownSystemPrompt() });

  // Language instruction
  if (LANGUAGE_INSTRUCTIONS[lang]) {
    messages.push({ role: "system", content: LANGUAGE_INSTRUCTIONS[lang] });
  }

  // Contexte utilisateur
  messages.push({
    role: "user",
    content: `Contexte utilisateur : ${JSON.stringify(context)}`,
  });

  // Préférences Grimoire
  if (preferences) {
    messages.push({ role: "system", content: preferences });
  }

  // Hint Q0 utilisateur
  if (userHint) {
    messages.push({
      role: "system",
      content: `INDICE UTILISATEUR : "${userHint}". Tiens-en compte dans tes propositions.`,
    });
  }

  // Historique de drill-down compressé
  for (const node of history) {
    messages.push({
      role: "assistant",
      content: JSON.stringify({
        q: node.question,
        A: node.optionA,
        B: node.optionB,
      }),
    });
    messages.push({
      role: "user",
      content: `Choix : ${node.choice}`,
    });
  }

  // Instruction serveur (le cœur du pilotage)
  messages.push({
    role: "system",
    content: `INSTRUCTION : ${state.instruction}`,
  });

  return messages;
}

/**
 * Décrit le contexte en langage humain pour le LLM.
 */
export function describeContextV3(
  context: Record<string, unknown>,
  lang: string,
): Record<string, unknown> {
  const described: Record<string, unknown> = { ...context };

  // Mapping environment
  const envMap: Record<string, Record<string, string>> = {
    fr: { env_home: "À la maison", env_shelter: "En intérieur (sorti)", env_open_air: "En plein air" },
    en: { env_home: "At home", env_shelter: "Indoors (going out)", env_open_air: "Outdoors" },
    es: { env_home: "En casa", env_shelter: "Interior (salir)", env_open_air: "Al aire libre" },
  };

  const socialMap: Record<string, Record<string, string>> = {
    fr: { solo: "Seul", friends: "Entre amis", couple: "En couple", family: "En famille" },
    en: { solo: "Solo", friends: "With friends", couple: "As a couple", family: "With family" },
    es: { solo: "Solo/a", friends: "Con amigos", couple: "En pareja", family: "En familia" },
  };

  const envStr = typeof context.environment === "string"
    ? (envMap[lang] ?? envMap.fr)[context.environment] ?? context.environment
    : undefined;
  if (envStr) described.environment = envStr;

  const socialStr = typeof context.social === "string"
    ? (socialMap[lang] ?? socialMap.fr)[context.social] ?? context.social
    : undefined;
  if (socialStr) described.social = socialStr;

  return described;
}

/**
 * Construit les messages pour la génération du pool de dichotomie (out-home).
 *
 * Le LLM reçoit la liste des activités et doit les organiser en duels binaires.
 */
export function buildOutdoorDichotomyMessages(
  activities: OutdoorActivity[],
  context: Record<string, unknown>,
  lang: string,
  userHint?: string,
): Array<{ role: string; content: string }> {
  const messages: Array<{ role: string; content: string }> = [];

  messages.push({
    role: "system",
    content: `Tu es Mogogo, un hibou magicien. Tu reçois une liste de lieux/activités disponibles près de l'utilisateur.

TON RÔLE :
- Organise ces lieux en 4-6 duels binaires (questions de type "Tu préfères X ou Y ?")
- Chaque duel divise les lieux en 2 groupes par critère (type de cuisine, ambiance, intensité, etc.)
- Les groupes sont identifiés par les IDs des lieux
- Les duels vont du plus général au plus spécifique
- Chaque lieu doit apparaître dans AU MOINS un duel (idéalement tous les duels)

FORMAT JSON STRICT :
{
  "mogogo_message": "...",
  "duels": [
    { "question": "...", "labelA": "...", "labelB": "...", "idsA": [...], "idsB": [...] }
  ]
}

RÈGLES :
1. labelA et labelB font max 40 caractères chacun
2. question fait max 80 caractères
3. Chaque duel couvre TOUS les lieux restants (union idsA + idsB = tous les IDs)
4. Les groupes sont équilibrés (~50/50)
5. mogogo_message max 120 caractères, fun et engageant
6. Réponds UNIQUEMENT en JSON valide, rien d'autre`,
  });

  // Language instruction
  if (LANGUAGE_INSTRUCTIONS[lang]) {
    messages.push({ role: "system", content: LANGUAGE_INSTRUCTIONS[lang] });
  }

  // Hint Q0 utilisateur
  if (userHint) {
    messages.push({
      role: "system",
      content: `INDICE UTILISATEUR : "${userHint}". Utilise-le pour orienter les critères de tes duels.`,
    });
  }

  // Liste compacte des activités
  const compact = activities.map((a) => ({
    id: a.id,
    name: a.name,
    theme: `${a.themeEmoji} ${a.themeSlug}`,
    rating: a.rating,
    vicinity: a.vicinity,
  }));

  messages.push({
    role: "user",
    content: `Contexte : ${JSON.stringify(context)}\n\nActivités disponibles (${activities.length}) :\n${JSON.stringify(compact, null, 1)}`,
  });

  return messages;
}
