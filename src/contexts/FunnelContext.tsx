import React, { createContext, useContext, useReducer, useCallback, useRef, useState, useEffect } from "react";
import "react-native-get-random-values";
import { v4 as uuidv4 } from "uuid";
import { callLLMGateway, NoPlumesError, QuotaExhaustedError } from "@/services/llm";
import { expandStreamingActions, filterUnsubscribedStreamingActions } from "@/services/subscriptions";
import { getDeviceId } from "@/services/deviceId";
import { usePlumes } from "@/contexts/PlumesContext";
import i18n from "@/i18n";
import { TAG_CATALOG, getEligibleThemeSlugs } from "@/constants/tags";
import type { LLMResponse, UserContextV3, FunnelPhase, ThemeDuel, OutdoorActivity, DichotomyNode, DichotomySnapshot, ResolutionMode } from "@/types";

// ── Pool helper ──

function isPoolExhaustedLocal(pool: string[], poolIndex: number): boolean {
  return poolIndex >= pool.length;
}

// ── Drill-Down Node (local, mirrors server type) ──

export interface PoolSnapshot {
  pool: string[];
  emojis: string[];
  poolIndex: number;
  response: LLMResponse;
}

export interface DrillDownNode {
  question: string;
  optionA: string;
  optionB: string;
  choice: "A" | "B" | "neither";
  poolSnapshot?: PoolSnapshot;
}

// ── State ──

export interface FunnelState {
  phase: FunnelPhase;
  context: UserContextV3 | null;
  sessionId: string | null;

  // Phase 2
  themeDuel: ThemeDuel | null;
  themePool: { slug: string; emoji: string }[];
  themePoolIndex: number;
  winningTheme: { slug: string; emoji: string } | null;
  rejectedThemes: string[];
  themesExhausted: boolean;

  // Phase 3
  drillHistory: DrillDownNode[];
  currentResponse: LLMResponse | null;
  subcategoryPool: string[] | null;
  subcategoryEmojis: string[] | null;
  poolIndex: number;

  // Phase 4
  recommendation: LLMResponse | null;
  rejectedTitles: string[];
  rerollExhausted: boolean;
  maxRerollsReached: boolean;

  // Common
  poolExhaustedCategory: string | null;

  // Out-home
  outdoorActivities: OutdoorActivity[] | null;
  candidateIds: string[] | null;
  dichotomyPool: DichotomyNode[] | null;
  dichotomyIndex: number;
  dichotomyHistory: DichotomySnapshot[];
  outdoorMogogoMessage: string | null;
  placesShortage: boolean;
  scanProgress: { step: "scanning" | "found" | "building_pool"; count?: number } | null;

  // Resolution mode
  resolution_mode: ResolutionMode;

  // Enrichissement outdoor
  enrichedActivities: Record<string, Partial<OutdoorActivity>> | null;
  outdoorRerollUsed: boolean;
  enrichmentLoading: boolean;

  // Common
  loading: boolean;
  error: string | null;
  classifyError: string | null;
  needsPlumes: boolean;
  pendingAction?: string;
}

type FunnelAction =
  | { type: "SET_CONTEXT"; payload: UserContextV3 }
  | { type: "SET_LOADING"; payload: boolean }
  | { type: "SET_ERROR"; payload: { message: string | null; pendingAction?: string } }
  | { type: "SET_THEME_DUEL"; payload: { duel: ThemeDuel; pool: { slug: string; emoji: string }[] } }
  | { type: "REJECT_THEME_DUEL" }
  | { type: "SELECT_THEME"; payload: { slug: string; emoji: string } }
  | { type: "SET_THEMES_EXHAUSTED" }
  | { type: "PUSH_DRILL_RESPONSE"; payload: { response: LLMResponse; choice?: string; node?: DrillDownNode } }
  | { type: "SET_POOL"; payload: { pool: string[]; response: LLMResponse } }
  | { type: "ADVANCE_POOL" }
  | { type: "REWIND_POOL" }
  | { type: "POP_DRILL" }
  | { type: "SET_POOL_EXHAUSTED"; payload: string }
  | { type: "CLEAR_POOL_EXHAUSTED" }
  | { type: "BACK_TO_THEME_DUEL" }
  | { type: "SET_REROLL_EXHAUSTED"; payload?: { maxRerollsReached: boolean } }
  | { type: "SET_NEEDS_PLUMES"; payload?: string }
  | { type: "CLEAR_NEEDS_PLUMES" }
  | { type: "SET_SCAN_PROGRESS"; payload: { step: "scanning" | "found" | "building_pool"; count?: number } }
  | { type: "SET_OUTDOOR_SCAN_RESULT"; payload: { activities: OutdoorActivity[]; shortage: boolean } }
  | { type: "SET_OUTDOOR_POOL"; payload: { pool: DichotomyNode[]; mogogoMessage?: string } }
  | { type: "OUTDOOR_CHOICE"; payload: "A" | "B" | "neither" }
  | { type: "OUTDOOR_BACK" }
  | { type: "SET_ENRICHMENT_LOADING"; payload: boolean }
  | { type: "SET_ENRICHED_ACTIVITIES"; payload: Record<string, Partial<OutdoorActivity>> }
  | { type: "OUTDOOR_REROLL" }
  | { type: "PATCH_CONTEXT"; payload: Partial<UserContextV3> }
  | { type: "SET_CLASSIFY_ERROR"; payload: string }
  | { type: "CLEAR_CLASSIFY_ERROR" }
  | { type: "RESET" };

const initialState: FunnelState = {
  phase: "theme_duel",
  context: null,
  sessionId: null,
  themeDuel: null,
  themePool: [],
  themePoolIndex: 0,
  winningTheme: null,
  rejectedThemes: [],
  themesExhausted: false,
  drillHistory: [],
  currentResponse: null,
  subcategoryPool: null,
  subcategoryEmojis: null,
  poolIndex: 0,
  poolExhaustedCategory: null,
  outdoorActivities: null,
  candidateIds: null,
  dichotomyPool: null,
  dichotomyIndex: 0,
  dichotomyHistory: [],
  outdoorMogogoMessage: null,
  placesShortage: false,
  scanProgress: null,
  recommendation: null,
  rejectedTitles: [],
  rerollExhausted: false,
  maxRerollsReached: false,
  resolution_mode: "INSPIRATION",
  enrichedActivities: null,
  outdoorRerollUsed: false,
  enrichmentLoading: false,
  loading: false,
  error: null,
  classifyError: null,
  needsPlumes: false,
};

export function funnelReducer(state: FunnelState, action: FunnelAction): FunnelState {
  switch (action.type) {
    case "SET_CONTEXT":
      return { ...initialState, context: action.payload, sessionId: uuidv4(), phase: "theme_duel", resolution_mode: action.payload.resolution_mode ?? "INSPIRATION" };

    case "SET_LOADING":
      return { ...state, loading: action.payload, error: action.payload ? null : state.error };

    case "SET_ERROR":
      return { ...state, error: action.payload.message, pendingAction: action.payload.pendingAction, loading: false };

    case "SET_CLASSIFY_ERROR":
      return { ...state, classifyError: action.payload, themesExhausted: true, phase: "theme_duel", loading: false, error: null };

    case "CLEAR_CLASSIFY_ERROR":
      return { ...state, classifyError: null };

    case "SET_THEME_DUEL":
      return {
        ...state,
        themeDuel: action.payload.duel,
        themePool: action.payload.pool,
        themePoolIndex: 2, // Les 2 premiers sont déjà affichés dans le duel
        loading: false,
      };

    case "REJECT_THEME_DUEL": {
      if (!state.themeDuel) return state;
      const rejected = [
        ...state.rejectedThemes,
        state.themeDuel.themeA.slug,
        state.themeDuel.themeB.slug,
      ];
      const pool = state.themePool;
      const idx = state.themePoolIndex;

      // Plus aucun thème restant → épuisé
      if (idx >= pool.length) {
        return { ...state, rejectedThemes: rejected, themeDuel: null, themesExhausted: true };
      }

      // Il reste exactement 1 thème → duel solo (themeB = themeA, UI affichera les deux identiques mais le choix est unique)
      if (idx + 1 >= pool.length) {
        const solo = pool[idx];
        const soloDuel: ThemeDuel = {
          themeA: { ...solo, label: "" },
          themeB: { ...solo, label: "" },
        };
        return {
          ...state,
          rejectedThemes: rejected,
          themeDuel: soloDuel,
          themePoolIndex: idx + 1,
        };
      }

      // Piocher la paire suivante depuis le pool local
      const nextA = pool[idx];
      const nextB = pool[idx + 1];
      const nextDuel: ThemeDuel = {
        themeA: { ...nextA, label: "" },
        themeB: { ...nextB, label: "" },
      };

      return {
        ...state,
        rejectedThemes: rejected,
        themeDuel: nextDuel,
        themePoolIndex: idx + 2,
      };
    }

    case "SELECT_THEME": {
      const isHome = state.context?.environment === "env_home";
      const goToPlaces = !isHome && state.resolution_mode === "LOCATION_BASED";
      return { ...state, winningTheme: action.payload, phase: goToPlaces ? "places_scan" : "drill_down", loading: false, themesExhausted: false, classifyError: null };
    }

    case "SET_THEMES_EXHAUSTED":
      return { ...state, themesExhausted: true, loading: false };

    case "PUSH_DRILL_RESPONSE": {
      const newHistory = action.payload.node
        ? [...state.drillHistory, action.payload.node]
        : state.drillHistory;

      const response = action.payload.response;
      const isFinalized = response.statut === "finalisé";
      const isReroll = action.payload.choice === "reroll";

      // Si la réponse contient un pool de sous-catégories, stocker le pool
      const hasPool = Array.isArray(response.subcategories) && response.subcategories.length > 0;

      // Emojis parallèles au pool
      const emojis = hasPool && Array.isArray(response.subcategory_emojis)
        ? response.subcategory_emojis
        : hasPool ? response.subcategories!.map(() => "\uD83D\uDD2E") : null;

      // Accumuler le titre précédent dans rejectedTitles si c'est un reroll
      const rejectedTitles = isReroll && state.recommendation?.recommandation_finale?.titre
        ? [...state.rejectedTitles, state.recommendation.recommandation_finale.titre]
        : isReroll ? state.rejectedTitles : [];

      return {
        ...state,
        drillHistory: newHistory,
        currentResponse: response,
        subcategoryPool: hasPool ? response.subcategories! : null,
        subcategoryEmojis: emojis,
        poolIndex: 0,
        recommendation: isFinalized ? response : null,
        rejectedTitles,
        rerollExhausted: isReroll ? false : state.rerollExhausted,
        phase: isFinalized ? "result" : "drill_down",
        loading: false,
        error: null,
      };
    }

    case "SET_POOL": {
      const poolEmojis = Array.isArray(action.payload.response.subcategory_emojis)
        ? action.payload.response.subcategory_emojis
        : action.payload.pool.map(() => "\uD83D\uDD2E");
      return {
        ...state,
        subcategoryPool: action.payload.pool,
        subcategoryEmojis: poolEmojis,
        poolIndex: 0,
        currentResponse: action.payload.response,
        loading: false,
        error: null,
      };
    }

    case "ADVANCE_POOL":
      return {
        ...state,
        poolIndex: state.poolIndex + 2,
      };

    case "REWIND_POOL":
      return {
        ...state,
        poolIndex: Math.max(0, state.poolIndex - 2),
      };

    case "POP_DRILL": {
      if (state.drillHistory.length === 0) return state;
      const poppedNode = state.drillHistory[state.drillHistory.length - 1];
      const newHistory = state.drillHistory.slice(0, -1);

      // Si le node popped a un poolSnapshot, restaurer le pool/index/response/emojis
      if (poppedNode.poolSnapshot) {
        return {
          ...state,
          drillHistory: newHistory,
          subcategoryPool: poppedNode.poolSnapshot.pool,
          subcategoryEmojis: poppedNode.poolSnapshot.emojis,
          poolIndex: poppedNode.poolSnapshot.poolIndex,
          currentResponse: poppedNode.poolSnapshot.response,
          error: null,
        };
      }

      return {
        ...state,
        drillHistory: newHistory,
        currentResponse: null,
        subcategoryPool: null,
        subcategoryEmojis: null,
        poolIndex: 0,
        error: null,
      };
    }

    case "SET_POOL_EXHAUSTED":
      return { ...state, poolExhaustedCategory: action.payload };

    case "CLEAR_POOL_EXHAUSTED":
      return { ...state, poolExhaustedCategory: null };

    case "BACK_TO_THEME_DUEL":
      return {
        ...state,
        phase: "theme_duel" as FunnelPhase,
        winningTheme: null,
        themeDuel: null,
        themePool: [],
        themePoolIndex: 0,
        themesExhausted: false,
        drillHistory: [],
        currentResponse: null,
        subcategoryPool: null,
        subcategoryEmojis: null,
        poolIndex: 0,
        poolExhaustedCategory: null,
        rejectedThemes: state.winningTheme
          ? [...state.rejectedThemes, state.winningTheme.slug]
          : state.rejectedThemes,
      };

    case "SET_REROLL_EXHAUSTED":
      return { ...state, rerollExhausted: true, maxRerollsReached: action.payload?.maxRerollsReached ?? false, loading: false };

    case "SET_NEEDS_PLUMES":
      return { ...state, needsPlumes: true, pendingAction: action.payload, loading: false };

    case "CLEAR_NEEDS_PLUMES":
      return { ...state, needsPlumes: false, pendingAction: undefined };

    case "SET_SCAN_PROGRESS":
      return { ...state, scanProgress: action.payload };

    case "SET_OUTDOOR_SCAN_RESULT": {
      const { activities, shortage } = action.payload;
      const allIds = activities.map(a => a.id);
      return {
        ...state,
        outdoorActivities: activities,
        candidateIds: allIds,
        placesShortage: shortage,
        loading: false,
      };
    }

    case "SET_OUTDOOR_POOL": {
      const duels = action.payload.pool;
      if (!duels || duels.length === 0) {
        // Pas de pool → direct result
        return { ...state, dichotomyPool: null, phase: "result", loading: false, scanProgress: null };
      }
      return {
        ...state,
        dichotomyPool: duels,
        dichotomyIndex: 0,
        dichotomyHistory: [],
        outdoorMogogoMessage: action.payload.mogogoMessage ?? null,
        phase: "outdoor_drill",
        loading: false,
        scanProgress: null,
      };
    }

    case "OUTDOOR_CHOICE": {
      const choice = action.payload;
      const pool = state.dichotomyPool;
      const idx = state.dichotomyIndex;
      if (!pool || !state.candidateIds || idx >= pool.length) return state;

      const duel = pool[idx];

      // Sauver snapshot pour backtrack
      const snapshot: DichotomySnapshot = {
        candidateIds: [...state.candidateIds],
        duelIndex: idx,
      };

      let newCandidates: string[];
      if (choice === "neither") {
        newCandidates = state.candidateIds; // pas de filtrage
      } else {
        const chosenIds = new Set(choice === "A" ? duel.idsA : duel.idsB);
        newCandidates = state.candidateIds.filter(id => chosenIds.has(id));
      }

      // Si le filtrage a tout supprimé (IDs orphelins), garder les candidats actuels
      if (newCandidates.length === 0) {
        newCandidates = state.candidateIds;
      }

      // Avancer au prochain duel NON TRIVIAL
      let newIndex = idx + 1;
      while (newIndex < pool.length) {
        const nextDuel = pool[newIndex];
        const aCount = newCandidates.filter(id => nextDuel.idsA.includes(id)).length;
        const bCount = newCandidates.filter(id => nextDuel.idsB.includes(id)).length;
        if (aCount > 0 && bCount > 0) break; // duel utile
        newIndex++;
      }

      const converged = newCandidates.length <= 3 || newIndex >= pool.length;

      return {
        ...state,
        candidateIds: newCandidates,
        dichotomyIndex: newIndex,
        dichotomyHistory: [...state.dichotomyHistory, snapshot],
        phase: converged ? "result" : "outdoor_drill",
      };
    }

    case "OUTDOOR_BACK": {
      if (state.dichotomyHistory.length === 0) return state;
      const lastSnapshot = state.dichotomyHistory[state.dichotomyHistory.length - 1];
      return {
        ...state,
        candidateIds: lastSnapshot.candidateIds,
        dichotomyIndex: lastSnapshot.duelIndex,
        dichotomyHistory: state.dichotomyHistory.slice(0, -1),
        phase: "outdoor_drill",
      };
    }

    case "SET_ENRICHMENT_LOADING":
      return { ...state, enrichmentLoading: action.payload };

    case "SET_ENRICHED_ACTIVITIES": {
      const enrichments = action.payload;
      // Merge les champs enrichis dans outdoorActivities
      const updatedActivities = state.outdoorActivities
        ? state.outdoorActivities.map(a => {
            const enriched = enrichments[a.id];
            if (!enriched) return a;
            return {
              ...a,
              formattedAddress: enriched.formattedAddress ?? a.formattedAddress,
              editorialSummary: enriched.editorialSummary ?? a.editorialSummary,
              openingHoursText: enriched.openingHoursText ?? a.openingHoursText,
              websiteUri: enriched.websiteUri ?? a.websiteUri,
              phoneNumber: enriched.phoneNumber ?? a.phoneNumber,
              isOpen: enriched.isOpen ?? a.isOpen,
              primaryTypeDisplayName: enriched.primaryTypeDisplayName ?? a.primaryTypeDisplayName,
            };
          })
        : state.outdoorActivities;
      return {
        ...state,
        enrichedActivities: enrichments,
        outdoorActivities: updatedActivities,
        enrichmentLoading: false,
      };
    }

    case "OUTDOOR_REROLL":
      return { ...state, outdoorRerollUsed: true };

    case "PATCH_CONTEXT":
      return { ...state, context: state.context ? { ...state.context, ...action.payload } : null };

    case "RESET":
      return initialState;

    default:
      return state;
  }
}

// ── Context ──

interface FunnelContextValue {
  state: FunnelState;
  setContext: (ctx: UserContextV3) => void;
  startThemeDuel: () => Promise<void>;
  rejectThemeDuel: () => Promise<void>;
  selectTheme: (slug: string, emoji: string) => void;
  makeDrillChoice: (choice: "A" | "B" | "neither") => Promise<void>;
  reroll: () => Promise<void>;
  forceDrillFinalize: () => Promise<void>;
  dismissPoolExhausted: () => void;
  goBack: () => void;
  reset: () => void;
  retry: () => Promise<void>;
  retryAfterPlumes: () => Promise<void>;
  classifyHint: (hintText: string) => Promise<void>;
  clearClassifyError: () => void;
  // Out-home
  startPlacesScan: () => Promise<void>;
  makeOutdoorChoice: (choice: "A" | "B" | "neither") => void;
  outdoorGoBack: () => void;
  enrichCandidates: () => Promise<void>;
  outdoorReroll: () => void;
}

const FunnelCtx = createContext<FunnelContextValue | null>(null);

export function FunnelProvider({ children, preferencesText, subscriptionsText, subscribedServices, reloadSubscriptions, reloadPreferences }: { children: React.ReactNode; preferencesText?: string; subscriptionsText?: string; subscribedServices?: string[]; reloadSubscriptions?: () => Promise<void>; reloadPreferences?: () => Promise<void> }) {
  const [state, dispatch] = useReducer(funnelReducer, initialState);
  const [deviceId, setDeviceId] = useState<string | null>(null);
  const { refresh: refreshPlumes } = usePlumes();

  useEffect(() => {
    getDeviceId().then(setDeviceId);
  }, []);

  const stateRef = useRef(state);
  stateRef.current = state;

  /** Filtre les actions streaming non-abonnées puis expanse pour les services abonnés */
  const expandFinalizedActions = useCallback((response: LLMResponse): LLMResponse => {
    if (response.statut !== "finalisé" || !response.recommandation_finale?.actions) {
      return response;
    }
    // 1. Filtrer les actions pour des services non-abonnés
    const filtered = filterUnsubscribedStreamingActions(
      response.recommandation_finale.actions,
      subscribedServices ?? [],
    );
    // 2. Expanser les services abonnés restants
    const expanded = subscribedServices?.length
      ? expandStreamingActions(filtered, subscribedServices)
      : filtered;
    return {
      ...response,
      recommandation_finale: { ...response.recommandation_finale, actions: expanded },
    };
  }, [subscribedServices]);

  const setContext = useCallback((ctx: UserContextV3) => {
    dispatch({ type: "SET_CONTEXT", payload: ctx });
    refreshPlumes();
    // Rafraîchir preferences & subscriptions depuis Supabase pour éviter les données
    // périmées (l'utilisateur a pu modifier le Grimoire entre deux sessions)
    reloadPreferences?.();
    reloadSubscriptions?.();
  }, [refreshPlumes, reloadPreferences, reloadSubscriptions]);

  /**
   * Classify Hint : classifier un texte libre en thème via le LLM.
   * Utilisé quand l'utilisateur a saisi un hint (Q0 sans tags ou thèmes épuisés).
   */
  const classifyHint = useCallback(async (hintText: string) => {
    const s = stateRef.current;
    if (!s.context) return;

    const trimmed = hintText.trim();
    if (trimmed.length < 3) {
      dispatch({ type: "SET_CLASSIFY_ERROR", payload: i18n.t("funnel.classifyHintTooShort") });
      return;
    }

    // Injecter le hint dans le contexte
    dispatch({ type: "PATCH_CONTEXT", payload: { user_hint: trimmed } });
    dispatch({ type: "SET_LOADING", payload: true });

    try {
      const response = await callLLMGateway({
        context: { ...s.context, user_hint: trimmed },
        phase: "classify_hint",
        session_id: s.sessionId ?? undefined,
      });

      const data = response as any;
      if (data.phase === "classify_nsfw") {
        dispatch({ type: "SET_CLASSIFY_ERROR", payload: i18n.t("funnel.classifyHintNsfw") });
      } else if (data.phase === "theme_classified" && data.theme?.slug && data.theme?.emoji) {
        dispatch({ type: "SELECT_THEME", payload: { slug: data.theme.slug, emoji: data.theme.emoji } });
      } else {
        dispatch({ type: "SET_CLASSIFY_ERROR", payload: i18n.t("funnel.classifyHintFailed") });
      }
    } catch (e: any) {
      dispatch({ type: "SET_CLASSIFY_ERROR", payload: e.message ?? i18n.t("funnel.classifyHintFailed") });
    }
  }, []);

  const clearClassifyError = useCallback(() => {
    dispatch({ type: "CLEAR_CLASSIFY_ERROR" });
  }, []);

  /**
   * Phase 2 : Construire le pool de thèmes éligibles et afficher le premier duel.
   * 100% local — aucun appel serveur.
   */
  const startThemeDuel = useCallback(async () => {
    const s = stateRef.current;
    if (!s.context) return;

    const env = s.context.environment ?? "env_shelter";

    // Q0 avec tags → sélection directe du thème sans duel
    const hintTags = s.context.user_hint_tags ?? [];
    if (hintTags.length > 0) {
      const directSlug = hintTags.find((t) => TAG_CATALOG[t]);
      if (directSlug) {
        const tag = TAG_CATALOG[directSlug];
        dispatch({ type: "SELECT_THEME", payload: { slug: directSlug, emoji: tag.emoji } });
        return;
      }
    }

    // Q0 avec texte libre (sans tags valides) → classification LLM
    const userHint = s.context.user_hint;
    if (typeof userHint === "string" && userHint.trim().length >= 3 && hintTags.length === 0) {
      await classifyHint(userHint);
      return;
    }

    // Construire le pool éligible en excluant les thèmes déjà rejetés
    const rejectedSet = new Set(s.rejectedThemes);
    const pool = getEligibleThemeSlugs(env)
      .filter((slug) => !rejectedSet.has(slug))
      .map((slug) => ({ slug, emoji: TAG_CATALOG[slug].emoji }));

    if (pool.length === 0) {
      dispatch({ type: "SET_THEMES_EXHAUSTED" });
      return;
    }

    // Pool de 1 thème → duel solo (A == B, UI n'affiche qu'un bouton)
    const duel: ThemeDuel = pool.length === 1
      ? { themeA: { ...pool[0], label: "" }, themeB: { ...pool[0], label: "" } }
      : { themeA: { ...pool[0], label: "" }, themeB: { ...pool[1], label: "" } };
    dispatch({ type: "SET_THEME_DUEL", payload: { duel, pool } });
  }, [classifyHint]);

  /**
   * Phase 2 : Rejeter le duel courant et piocher la paire suivante depuis le pool local.
   * Instantané — aucun appel serveur.
   */
  const rejectThemeDuel = useCallback(async () => {
    dispatch({ type: "REJECT_THEME_DUEL" });
  }, []);

  /**
   * Phase 2 → 3 : Sélectionner un thème du duel.
   */
  const selectTheme = useCallback((slug: string, emoji: string) => {
    dispatch({ type: "SELECT_THEME", payload: { slug, emoji } });
  }, []);

  /**
   * Phase 3 : Faire un choix dans le drill-down (A, B, neither).
   *
   * Pool logic :
   * - neither + pool actif → avance localement dans le pool (0 appel LLM)
   * - A/B + pool actif → sauve poolSnapshot, appelle le serveur pour subdiviser
   * - pas de pool → comportement classique (appel serveur)
   */
  const makeDrillChoice = useCallback(async (choice: "A" | "B" | "neither") => {
    const s = stateRef.current;
    if (!s.context || !s.winningTheme) return;

    // ── Neither local si pool actif ──
    if (choice === "neither" && s.subcategoryPool && !isPoolExhaustedLocal(s.subcategoryPool, s.poolIndex + 2)) {
      dispatch({ type: "ADVANCE_POOL" });
      return;
    }

    // ── Neither mais pool épuisé → modale informative puis backtrack (ou retour thème) ──
    if (choice === "neither" && s.subcategoryPool && isPoolExhaustedLocal(s.subcategoryPool, s.poolIndex + 2)) {
      const lastABNode = [...s.drillHistory].reverse().find(n => n.choice === "A" || n.choice === "B");
      const slug = s.winningTheme?.slug ?? "";
      const category = lastABNode
        ? (lastABNode.choice === "A" ? lastABNode.optionA : lastABNode.optionB)
        : i18n.t(`tags.${slug}`, { defaultValue: slug });
      dispatch({ type: "SET_POOL_EXHAUSTED", payload: category });
      return;
    }

    // Construire le node à ajouter à l'historique
    let nodeToAdd: DrillDownNode | undefined;
    if (s.currentResponse?.options && (choice === "A" || choice === "B" || choice === "neither")) {
      // Déterminer les options actuelles (pool ou response.options)
      let optA: string;
      let optB: string;
      if (s.subcategoryPool) {
        optA = s.subcategoryPool[s.poolIndex] ?? "";
        optB = s.subcategoryPool[s.poolIndex + 1] ?? "";
      } else {
        optA = s.currentResponse.options.A;
        optB = s.currentResponse.options.B;
      }

      nodeToAdd = {
        question: s.currentResponse.question ?? "",
        optionA: optA,
        optionB: optB,
        choice,
      };

      // Sauver le poolSnapshot pour goBack si pool actif et choix A/B
      if (s.subcategoryPool && s.currentResponse && (choice === "A" || choice === "B")) {
        nodeToAdd.poolSnapshot = {
          pool: s.subcategoryPool,
          emojis: s.subcategoryEmojis ?? s.subcategoryPool.map(() => "\uD83D\uDD2E"),
          poolIndex: s.poolIndex,
          response: s.currentResponse,
        };
      }
    }

    dispatch({ type: "SET_LOADING", payload: true });

    try {
      // Stripper les poolSnapshot avant envoi au serveur
      const drillHistory = nodeToAdd
        ? [...s.drillHistory, nodeToAdd].map(({ poolSnapshot, ...rest }) => rest)
        : s.drillHistory.map(({ poolSnapshot, ...rest }) => rest);

      const response = await callLLMGateway({
        context: s.context,
        phase: "drill_down",
        choice,
        theme_slug: s.winningTheme.slug,
        drill_history: drillHistory,
        session_id: s.sessionId ?? undefined,
        device_id: deviceId ?? undefined,
        preferences: preferencesText,
        subscriptions: subscriptionsText,
      });

      dispatch({ type: "PUSH_DRILL_RESPONSE", payload: { response: expandFinalizedActions(response), choice, node: nodeToAdd } });

      // Rafraîchir les plumes après consommation serveur (fire-and-forget côté serveur)
      if (response.statut === "finalisé") {
        setTimeout(() => refreshPlumes(), 500);
      }
    } catch (e: any) {
      if (e instanceof NoPlumesError) {
        dispatch({ type: "SET_NEEDS_PLUMES", payload: choice });
        return;
      }
      dispatch({ type: "SET_ERROR", payload: { message: e.message ?? i18n.t("common.unknownError"), pendingAction: choice } });
    }
  }, [preferencesText, subscriptionsText, deviceId, refreshPlumes, expandFinalizedActions]);

  /**
   * Phase 4 : Reroll — Demander une alternative.
   * Envoie les titres précédemment rejetés pour que le LLM ne les repropose pas.
   * Si le LLM repropose un titre déjà rejeté, on marque le reroll comme épuisé.
   */
  const reroll = useCallback(async () => {
    const s = stateRef.current;
    if (!s.context || !s.winningTheme) return;

    // Collecter tous les titres à exclure (rejetés + courant)
    const currentTitle = s.recommendation?.recommandation_finale?.titre;
    const allRejected = currentTitle
      ? [...s.rejectedTitles, currentTitle]
      : s.rejectedTitles;

    dispatch({ type: "SET_LOADING", payload: true });

    try {
      const response = await callLLMGateway({
        context: s.context,
        phase: "reroll",
        choice: "reroll",
        theme_slug: s.winningTheme.slug,
        drill_history: s.drillHistory.map(({ poolSnapshot, ...rest }) => rest),
        session_id: s.sessionId ?? undefined,
        device_id: deviceId ?? undefined,
        preferences: preferencesText,
        subscriptions: subscriptionsText,
        rejected_titles: allRejected.length > 0 ? allRejected : undefined,
      });

      // Le LLM ou le serveur signale qu'il n'a plus rien à proposer
      if ((response as LLMResponse)?.statut === "épuisé") {
        const isMaxRerolls = (response as any)?.mogogo_message === "max_rerolls_reached";
        dispatch({ type: "SET_REROLL_EXHAUSTED", payload: { maxRerollsReached: isMaxRerolls } });
        return;
      }

      dispatch({ type: "PUSH_DRILL_RESPONSE", payload: { response: expandFinalizedActions(response), choice: "reroll" } });
    } catch (e: any) {
      dispatch({ type: "SET_ERROR", payload: { message: e.message ?? i18n.t("common.unknownError"), pendingAction: "reroll" } });
    }
  }, [preferencesText, subscriptionsText, deviceId, expandFinalizedActions]);

  /**
   * Phase 3 : "J'ai de la chance" — Forcer la finalisation.
   */
  const forceDrillFinalize = useCallback(async () => {
    const s = stateRef.current;
    if (!s.context || !s.winningTheme) return;

    dispatch({ type: "SET_LOADING", payload: true });

    try {
      const response = await callLLMGateway({
        context: s.context,
        phase: "drill_down",
        theme_slug: s.winningTheme.slug,
        drill_history: s.drillHistory.map(({ poolSnapshot, ...rest }) => rest),
        session_id: s.sessionId ?? undefined,
        device_id: deviceId ?? undefined,
        preferences: preferencesText,
        subscriptions: subscriptionsText,
        force_finalize: true,
      });

      dispatch({ type: "PUSH_DRILL_RESPONSE", payload: { response: expandFinalizedActions(response) } });

      // Rafraîchir les plumes après consommation serveur (fire-and-forget côté serveur)
      if (response.statut === "finalisé") {
        setTimeout(() => refreshPlumes(), 500);
      }
    } catch (e: any) {
      if (e instanceof NoPlumesError) {
        dispatch({ type: "SET_NEEDS_PLUMES", payload: "finalize" });
        return;
      }
      dispatch({ type: "SET_ERROR", payload: { message: e.message ?? i18n.t("common.unknownError"), pendingAction: "finalize" } });
    }
  }, [preferencesText, subscriptionsText, deviceId, refreshPlumes, expandFinalizedActions]);

  const dismissPoolExhausted = useCallback(async () => {
    const s = stateRef.current;
    dispatch({ type: "CLEAR_POOL_EXHAUSTED" });

    if (s.drillHistory.length === 0) {
      // À la racine du drill-down : retourner au duel de thèmes
      dispatch({ type: "BACK_TO_THEME_DUEL" });
      // Attendre le prochain tick pour que le reducer ait appliqué BACK_TO_THEME_DUEL
      await new Promise((r) => setTimeout(r, 0));
      await startThemeDuel();
    } else {
      dispatch({ type: "POP_DRILL" });
    }
  }, [startThemeDuel]);

  const goBack = useCallback(() => {
    const s = stateRef.current;
    // Si on est dans un pool et pas à la première paire, reculer dans le pool
    if (s.subcategoryPool && s.poolIndex > 0) {
      dispatch({ type: "REWIND_POOL" });
    } else {
      dispatch({ type: "POP_DRILL" });
    }
  }, []);

  const reset = useCallback(() => {
    dispatch({ type: "RESET" });
  }, []);

  // ── Out-home methods ──

  const startPlacesScan = useCallback(async () => {
    const s = stateRef.current;
    if (!s.context) return;

    try {
      // Étape 1/2 : Scan Google Places
      dispatch({ type: "SET_SCAN_PROGRESS", payload: { step: "scanning" } });

      const scanResponse = await callLLMGateway({
        context: s.context,
        phase: "places_scan",
        session_id: s.sessionId ?? undefined,
        device_id: deviceId ?? undefined,
        theme_slug: s.winningTheme?.slug,
      });

      const scanData = scanResponse as any;
      const activities: OutdoorActivity[] = scanData.activities ?? [];
      const shortage = scanData.shortage ?? false;

      dispatch({ type: "SET_OUTDOOR_SCAN_RESULT", payload: { activities, shortage } });

      // Afficher le compteur "X activités trouvées"
      dispatch({ type: "SET_SCAN_PROGRESS", payload: { step: "found", count: activities.length } });

      if (activities.length < 3) {
        // Pas assez pour un pool → rester en phase places_scan avec shortage
        dispatch({ type: "SET_OUTDOOR_POOL", payload: { pool: [] } });
        return;
      }

      // Pause 1.5s pour que l'utilisateur voie le compteur
      await new Promise(r => setTimeout(r, 1500));

      // Étape 2/2 : Génération du pool de dichotomie
      dispatch({ type: "SET_SCAN_PROGRESS", payload: { step: "building_pool" } });

      const poolResponse = await callLLMGateway({
        context: s.context,
        phase: "outdoor_pool",
        session_id: s.sessionId ?? undefined,
        device_id: deviceId ?? undefined,
        activities,
      });

      const poolData = poolResponse as any;
      dispatch({ type: "SET_OUTDOOR_POOL", payload: {
        pool: poolData.dichotomy_pool?.duels ?? [],
        mogogoMessage: poolData.dichotomy_pool?.mogogo_message,
      } });

      // Rafraîchir plumes après consommation
      setTimeout(() => refreshPlumes(), 500);
    } catch (e: any) {
      if (e instanceof NoPlumesError) {
        dispatch({ type: "SET_NEEDS_PLUMES", payload: "places_scan" });
        return;
      }
      if (e instanceof QuotaExhaustedError) {
        dispatch({ type: "SET_ERROR", payload: { message: i18n.t("funnel.quotaExhausted"), pendingAction: "places_scan" } });
        return;
      }
      dispatch({ type: "SET_ERROR", payload: { message: e.message ?? i18n.t("common.unknownError"), pendingAction: "places_scan" } });
    }
  }, [deviceId, refreshPlumes]);

  const makeOutdoorChoice = useCallback((choice: "A" | "B" | "neither") => {
    dispatch({ type: "OUTDOOR_CHOICE", payload: choice });
  }, []);

  const outdoorGoBack = useCallback(() => {
    dispatch({ type: "OUTDOOR_BACK" });
  }, []);

  const enrichCandidates = useCallback(async () => {
    const s = stateRef.current;
    if (!s.outdoorActivities || !s.candidateIds || s.enrichedActivities) return;

    const candidates = s.candidateIds
      .map(id => s.outdoorActivities!.find(a => a.id === id))
      .filter((a): a is OutdoorActivity => a != null)
      .sort((a, b) => (b.rating ?? 0) - (a.rating ?? 0))
      .slice(0, 2);

    if (candidates.length === 0) return;

    dispatch({ type: "SET_ENRICHMENT_LOADING", payload: true });

    try {
      const response = await callLLMGateway({
        context: s.context!,
        phase: "places_enrich",
        session_id: s.sessionId ?? undefined,
        place_ids: candidates.map(c => c.id),
      });

      const data = response as any;
      dispatch({ type: "SET_ENRICHED_ACTIVITIES", payload: data.enrichments ?? {} });
    } catch {
      // Fallback silencieux : on marque l'enrichissement comme terminé (objet vide)
      // pour que la sauvegarde historique ne reste pas bloquée.
      dispatch({ type: "SET_ENRICHED_ACTIVITIES", payload: {} });
    }
  }, []);

  const outdoorReroll = useCallback(() => {
    const s = stateRef.current;
    if (s.outdoorRerollUsed) return;
    dispatch({ type: "OUTDOOR_REROLL" });
  }, []);

  /**
   * Relancer la dernière action qui a échoué (erreur réseau, missing question, etc.)
   */
  const retry = useCallback(async () => {
    const pending = stateRef.current.pendingAction;
    dispatch({ type: "SET_ERROR", payload: { message: null } });
    if (pending === "places_scan") {
      await startPlacesScan();
    } else if (pending === "finalize") {
      await forceDrillFinalize();
    } else if (pending === "reroll") {
      await reroll();
    } else if (pending === "A" || pending === "B" || pending === "neither") {
      await makeDrillChoice(pending as "A" | "B" | "neither");
    } else {
      // Pas de pendingAction → fallback startThemeDuel
      await startThemeDuel();
    }
  }, [makeDrillChoice, forceDrillFinalize, reroll, startPlacesScan, startThemeDuel]);

  const retryAfterPlumes = useCallback(async () => {
    const pending = stateRef.current.pendingAction;
    dispatch({ type: "CLEAR_NEEDS_PLUMES" });
    if (pending === "places_scan") {
      await startPlacesScan();
    } else if (pending === "finalize") {
      await forceDrillFinalize();
    } else if (pending === "A" || pending === "B" || pending === "neither") {
      await makeDrillChoice(pending as "A" | "B" | "neither");
    } else {
      await makeDrillChoice(undefined as any);
    }
  }, [makeDrillChoice, forceDrillFinalize, startPlacesScan]);

  return (
    <FunnelCtx.Provider value={{
      state,
      setContext,
      startThemeDuel,
      rejectThemeDuel,
      selectTheme,
      classifyHint,
      clearClassifyError,
      makeDrillChoice,
      reroll,
      forceDrillFinalize,
      dismissPoolExhausted,
      goBack,
      reset,
      retry,
      retryAfterPlumes,
      startPlacesScan,
      makeOutdoorChoice,
      outdoorGoBack,
      enrichCandidates,
      outdoorReroll,
    }}>
      {children}
    </FunnelCtx.Provider>
  );
}

export function useFunnel() {
  const ctx = useContext(FunnelCtx);
  if (!ctx) {
    throw new Error("useFunnel must be used within a FunnelProvider");
  }
  return ctx;
}
