/**
 * Phase 3 : Drill-Down State Machine
 *
 * Remplace discovery-state.ts — pilotage serveur de la phase 3 du funnel V3.
 * Le serveur pré-digère l'état et donne une instruction unique au LLM.
 */

import { THEMES } from "./theme-engine.ts";

export interface DrillDownNode {
  question: string;
  optionA: string;
  optionB: string;
  choice: "A" | "B" | "neither";
}

export interface DrillDownInput {
  themeSlug: string;
  isHome: boolean;
  history: DrillDownNode[];
  choice: "A" | "B" | "neither" | undefined;
  minDepth?: number;                // profondeur minimale avant que le LLM PUISSE finaliser (défaut: 3)
  consecutiveNeithers?: number;     // compteur de neithers consécutifs (pour backtrack)
  availablePlacesCount?: number;    // nombre de places disponibles après filtrage
  radiusMaxReached?: boolean;       // rayon max atteint sans résultat
  homeAlreadyTried?: boolean;       // mode home déjà essayé en fallback
  forceFinalize?: boolean;          // "J'ai de la chance" — forcer le LLM à finaliser
}

export interface DrillDownState {
  mode: "home" | "outing";
  depth: number;
  needsPlaces: boolean;
  isNeither: boolean;
  shouldBacktrack: boolean;
  isImpasse: boolean;
  mayFinalize: boolean;             // true si le LLM est autorisé à finaliser (depth >= minDepth)
  willFinalize: boolean;            // alias pour compat (= mayFinalize && pas neither)
  fallbackLevel: number;            // 0=ok, 1=étendre rayon, 2=mode HOME, 3=best guess
  instruction: string;
  branchPath: string[];             // chemin de la branche active
  currentCategory: string;          // catégorie courante (dernière sélection ou thème racine)
}

const DEFAULT_MIN_DEPTH = 3;
const DEFAULT_MAX_DEPTH = 5;
const NEITHER_BACKTRACK_THRESHOLD = 3;

/**
 * Extrait le chemin de la branche active depuis l'historique.
 * Chaque choix A/B pousse l'option choisie dans le chemin.
 * Les choix "neither" ne changent pas le chemin (on reste au même niveau).
 */
export function extractBranchPath(themeSlug: string, history: DrillDownNode[]): string[] {
  const theme = THEMES.find(t => t.slug === themeSlug);
  const root = theme?.name ?? themeSlug;
  const path: string[] = [root];
  for (const node of history) {
    if (node.choice === "A") {
      path.push(node.optionA);
    } else if (node.choice === "B") {
      path.push(node.optionB);
    }
    // neither → on ne pousse rien, on reste au même niveau
  }
  return path;
}

/**
 * Construit l'état de drill-down pour un pas de la phase 3.
 */
export function buildDrillDownState(input: DrillDownInput): DrillDownState {
  const minDepth = input.minDepth ?? DEFAULT_MIN_DEPTH;
  const mode = input.isHome ? "home" : "outing";
  const needsPlaces = !input.isHome;
  const isNeither = input.choice === "neither";

  // Calculer la profondeur : nombre de choix A/B dans l'historique + 1 (courant)
  const depth = input.history.length + (input.choice ? 1 : 0);

  // Compter les neithers consécutifs à la fin de l'historique
  let consecutiveNeithers = input.consecutiveNeithers ?? 0;
  if (consecutiveNeithers === 0 && isNeither) {
    // Compter depuis la fin de l'historique
    let count = 0;
    for (let i = input.history.length - 1; i >= 0; i--) {
      if (input.history[i].choice === "neither") {
        count++;
      } else {
        break;
      }
    }
    consecutiveNeithers = count + 1; // +1 pour le choix courant
  }

  const shouldBacktrack = consecutiveNeithers >= NEITHER_BACKTRACK_THRESHOLD;

  // Impasse : backtrack requis mais plus de parent (à la racine)
  const isImpasse = shouldBacktrack && input.history.length === 0;

  // Le LLM est autorisé à finaliser quand depth >= minDepth ou forceFinalize
  const mayFinalize = input.forceFinalize || (!isNeither && depth >= minDepth && input.choice !== undefined);
  // willFinalize = alias pour compatibilité (le LLM décide, pas le serveur)
  const willFinalize = mayFinalize;

  // Fallbacks
  let fallbackLevel = 0;
  if (input.availablePlacesCount !== undefined && input.availablePlacesCount === 0) {
    fallbackLevel = 1; // Étendre rayon
    if (input.radiusMaxReached) {
      fallbackLevel = 2; // Mode HOME
      if (input.homeAlreadyTried) {
        fallbackLevel = 3; // Best guess
      }
    }
  }

  // Extraire le chemin de la branche active
  const branchPath = extractBranchPath(input.themeSlug, input.history);
  const currentCategory = branchPath[branchPath.length - 1];

  // Construire l'instruction pour le LLM
  const instruction = buildInstruction(input, {
    mode,
    depth,
    isNeither,
    shouldBacktrack,
    isImpasse,
    mayFinalize,
    willFinalize,
    fallbackLevel,
    needsPlaces,
    branchPath,
    currentCategory,
  });

  return {
    mode,
    depth,
    needsPlaces,
    isNeither,
    shouldBacktrack,
    isImpasse,
    mayFinalize,
    willFinalize,
    fallbackLevel,
    instruction,
    branchPath,
    currentCategory,
  };
}

function formatPath(path: string[]): string {
  return path.join(" > ");
}

function buildInstruction(
  input: DrillDownInput,
  state: Omit<DrillDownState, "instruction">,
): string {
  const { branchPath, currentCategory } = state;
  const pathStr = formatPath(branchPath);
  const modeStr = state.mode === "home" ? "à la maison" : "en sortie";

  if (input.forceFinalize) {
    return `FORCE_FINALIZE : L'utilisateur a choisi "J'ai de la chance" dans "${currentCategory}" (chemin : ${pathStr}). Tu DOIS proposer UNE activité concrète et spécifique avec statut "finalisé", phase "resultat" et une recommandation_finale. Ne pose AUCUNE question. Choisis la meilleure activité possible dans "${currentCategory}" ${modeStr}.`;
  }

  if (state.isImpasse) {
    return `IMPASSE : L'utilisateur a rejeté trop d'options dans "${currentCategory}" (${pathStr}), mode ${modeStr}. Propose un résultat "meilleur effort" compatible avec le mode ${modeStr} basé sur le contexte général. Réponds avec statut "finalisé".`;
  }

  if (state.shouldBacktrack) {
    const parentCategory = branchPath.length >= 2 ? branchPath[branchPath.length - 2] : currentCategory;
    return `BACKTRACK : L'utilisateur a rejeté 3 fois de suite dans "${currentCategory}". Remonte à "${parentCategory}" et propose 2 sous-catégories complètement différentes de ce qui a été proposé jusque-là. Toutes les propositions doivent être compatibles avec le mode ${modeStr}.`;
  }

  // neither simple → géré côté client (avance dans le pool). On retourne quand même un
  // POOL_CLASSIFICATION comme fallback serveur si le client ne gère pas le pool.
  if (state.isNeither) {
    return `POOL_CLASSIFICATION : L'utilisateur rejette les sous-catégories proposées pour "${currentCategory}". Propose TOUTES les sous-catégories possibles de "${currentCategory}" ${modeStr} (entre 4 et 8) dans le champ "subcategories" (tableau JSON). Remplis aussi "options.A" et "options.B" avec les 2 premières sous-catégories. Reste OBLIGATOIREMENT dans "${currentCategory}" (chemin : ${pathStr}). Propose des sous-catégories radicalement différentes de celles déjà rejetées. Toutes les sous-catégories doivent être compatibles avec le mode ${modeStr}.`;
  }

  // Premier appel (pas de choix encore)
  if (input.history.length === 0 && !input.choice) {
    return `POOL_CLASSIFICATION : Propose TOUTES les grandes catégories d'activités ${modeStr} dans le thème "${currentCategory}" (entre 4 et 8) dans le champ "subcategories" (tableau JSON). Remplis aussi "options.A" et "options.B" avec les 2 premières sous-catégories. Les sous-catégories doivent être des catégories larges et distinctes couvrant le champ de "${currentCategory}". Chaque sous-catégorie fait max 40 caractères.`;
  }

  // Profondeur maximale atteinte → forcer la finalisation
  const maxDepth = DEFAULT_MAX_DEPTH;
  if (state.depth >= maxDepth && state.mayFinalize) {
    return `FINALISE MAINTENANT : L'utilisateur a suffisamment affiné ses choix (chemin : ${pathStr}). Tu DOIS proposer UNE activité concrète et spécifique dans "${currentCategory}" ${modeStr} avec statut "finalisé", phase "resultat" et une recommandation_finale. Ne pose AUCUNE question supplémentaire.`;
  }

  // Subdivision standard — le LLM décide s'il peut encore subdiviser ou s'il finalise
  if (state.mayFinalize) {
    const urgency = state.depth >= maxDepth - 1
      ? `Tu as atteint la profondeur ${state.depth}/${maxDepth}. Tu DEVRAIS répondre avec statut "finalisé" sauf si "${currentCategory}" est réellement trop vague. Au prochain pas, la finalisation sera obligatoire.`
      : `Si "${currentCategory}" est déjà assez précise pour désigner une activité concrète (ex: un type de jeu, un style de cuisine, un genre de film), propose directement UNE activité finale avec statut "finalisé".`;
    return `POOL_CLASSIFICATION : L'utilisateur a choisi "${currentCategory}" (chemin : ${pathStr}, mode ${modeStr}). Si "${currentCategory}" peut encore être subdivisée en catégories réellement distinctes, propose TOUTES les sous-catégories possibles ${modeStr} (entre 4 et 8) dans le champ "subcategories" (tableau JSON). Remplis aussi "options.A" et "options.B" avec les 2 premières. Chaque sous-catégorie fait max 40 caractères. Toutes les sous-catégories doivent être compatibles avec le mode ${modeStr}. ${urgency}`;
  }

  return `POOL_CLASSIFICATION : L'utilisateur a choisi "${currentCategory}" (chemin : ${pathStr}, mode ${modeStr}). Subdivise "${currentCategory}" en proposant TOUTES les sous-catégories possibles ${modeStr} (entre 4 et 8) dans le champ "subcategories" (tableau JSON). Remplis aussi "options.A" et "options.B" avec les 2 premières sous-catégories. Chaque sous-catégorie fait max 40 caractères. Toutes les sous-catégories doivent être compatibles avec le mode ${modeStr}. Continue à classifier, ne propose pas encore d'activité finale.`;
}
