import React, { createContext, useContext, useReducer, useCallback, useRef, useState, useEffect } from "react";
import "react-native-get-random-values";
import { v4 as uuidv4 } from "uuid";
import { callLLMGateway, NoPlumesError } from "@/services/llm";
import { getDeviceId } from "@/services/deviceId";
import { usePlumes } from "@/contexts/PlumesContext";
import i18n from "@/i18n";
import type { LLMResponse, UserContextV3, FunnelPhase, ThemeDuel } from "@/types";
import type { ThemeConfig } from "../../supabase/functions/_shared/theme-engine";

// ── Pool helper ──

function isPoolExhaustedLocal(pool: string[], poolIndex: number): boolean {
  return poolIndex >= pool.length;
}

// ── Drill-Down Node (local, mirrors server type) ──

export interface PoolSnapshot {
  pool: string[];
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

interface FunnelState {
  phase: FunnelPhase;
  context: UserContextV3 | null;
  sessionId: string | null;

  // Phase 2
  themeDuel: ThemeDuel | null;
  winningTheme: { slug: string; emoji: string } | null;
  rejectedThemes: string[];
  themesExhausted: boolean;

  // Phase 3
  drillHistory: DrillDownNode[];
  currentResponse: LLMResponse | null;
  subcategoryPool: string[] | null;
  poolIndex: number;

  // Phase 4
  recommendation: LLMResponse | null;
  rejectedTitles: string[];
  rerollExhausted: boolean;
  maxRerollsReached: boolean;

  // Common
  poolExhaustedCategory: string | null;

  // Common
  loading: boolean;
  error: string | null;
  needsPlumes: boolean;
  pendingAction?: string;
}

type FunnelAction =
  | { type: "SET_CONTEXT"; payload: UserContextV3 }
  | { type: "SET_LOADING"; payload: boolean }
  | { type: "SET_ERROR"; payload: string | null }
  | { type: "SET_THEME_DUEL"; payload: ThemeDuel }
  | { type: "REJECT_THEME_DUEL"; payload: ThemeDuel }
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
  | { type: "RESET" };

const initialState: FunnelState = {
  phase: "theme_duel",
  context: null,
  sessionId: null,
  themeDuel: null,
  winningTheme: null,
  rejectedThemes: [],
  themesExhausted: false,
  drillHistory: [],
  currentResponse: null,
  subcategoryPool: null,
  poolIndex: 0,
  poolExhaustedCategory: null,
  recommendation: null,
  rejectedTitles: [],
  rerollExhausted: false,
  maxRerollsReached: false,
  loading: false,
  error: null,
  needsPlumes: false,
};

function funnelReducer(state: FunnelState, action: FunnelAction): FunnelState {
  switch (action.type) {
    case "SET_CONTEXT":
      return { ...initialState, context: action.payload, sessionId: uuidv4(), phase: "theme_duel" };

    case "SET_LOADING":
      return { ...state, loading: action.payload, error: action.payload ? null : state.error };

    case "SET_ERROR":
      return { ...state, error: action.payload, loading: false };

    case "SET_THEME_DUEL":
      return { ...state, themeDuel: action.payload, loading: false };

    case "REJECT_THEME_DUEL": {
      const rejected = [
        ...state.rejectedThemes,
        action.payload.themeA.slug,
        action.payload.themeB.slug,
      ];
      return { ...state, rejectedThemes: rejected, themeDuel: null, loading: false };
    }

    case "SELECT_THEME":
      return { ...state, winningTheme: action.payload, phase: "drill_down", loading: false, themesExhausted: false };

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

      // Accumuler le titre précédent dans rejectedTitles si c'est un reroll
      const rejectedTitles = isReroll && state.recommendation?.recommandation_finale?.titre
        ? [...state.rejectedTitles, state.recommendation.recommandation_finale.titre]
        : isReroll ? state.rejectedTitles : [];

      return {
        ...state,
        drillHistory: newHistory,
        currentResponse: response,
        subcategoryPool: hasPool ? response.subcategories! : null,
        poolIndex: 0,
        recommendation: isFinalized ? response : null,
        rejectedTitles,
        rerollExhausted: isReroll ? false : state.rerollExhausted,
        phase: isFinalized ? "result" : "drill_down",
        loading: false,
        error: null,
      };
    }

    case "SET_POOL":
      return {
        ...state,
        subcategoryPool: action.payload.pool,
        poolIndex: 0,
        currentResponse: action.payload.response,
        loading: false,
        error: null,
      };

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

      // Si le node popped a un poolSnapshot, restaurer le pool/index/response
      if (poppedNode.poolSnapshot) {
        return {
          ...state,
          drillHistory: newHistory,
          subcategoryPool: poppedNode.poolSnapshot.pool,
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
        themesExhausted: false,
        drillHistory: [],
        currentResponse: null,
        subcategoryPool: null,
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
  retryAfterPlumes: () => Promise<void>;
}

const FunnelCtx = createContext<FunnelContextValue | null>(null);

export function FunnelProvider({ children, preferencesText }: { children: React.ReactNode; preferencesText?: string }) {
  const [state, dispatch] = useReducer(funnelReducer, initialState);
  const [deviceId, setDeviceId] = useState<string | null>(null);
  const { refresh: refreshPlumes } = usePlumes();

  useEffect(() => {
    getDeviceId().then(setDeviceId);
  }, []);

  const stateRef = useRef(state);
  stateRef.current = state;

  const setContext = useCallback((ctx: UserContextV3) => {
    dispatch({ type: "SET_CONTEXT", payload: ctx });
    refreshPlumes();
  }, [refreshPlumes]);

  /**
   * Phase 2 : Demander un duel de thèmes au serveur.
   */
  const startThemeDuel = useCallback(async () => {
    const s = stateRef.current;
    if (!s.context) return;

    dispatch({ type: "SET_LOADING", payload: true });

    try {
      const response = await callLLMGateway({
        context: s.context,
        phase: "theme_duel",
        session_id: s.sessionId ?? undefined,
        device_id: deviceId ?? undefined,
        preferences: preferencesText,
        rejected_themes: s.rejectedThemes.length > 0 ? s.rejectedThemes : undefined,
      });

      // Le serveur retourne soit un duel, soit un thème direct (Q0 tags), soit épuisé
      const data = response as any;
      if (data.phase === "themes_exhausted") {
        dispatch({ type: "SET_THEMES_EXHAUSTED" });
      } else if (data.phase === "theme_selected" && data.theme) {
        dispatch({ type: "SELECT_THEME", payload: data.theme });
      } else if (data.duel) {
        dispatch({ type: "SET_THEME_DUEL", payload: data.duel });
      } else {
        dispatch({ type: "SET_ERROR", payload: i18n.t("common.unknownError") });
      }
    } catch (e: any) {
      dispatch({ type: "SET_ERROR", payload: e.message ?? i18n.t("common.unknownError") });
    }
  }, [preferencesText, deviceId]);

  /**
   * Phase 2 : Rejeter le duel courant et en demander un nouveau.
   */
  const rejectThemeDuel = useCallback(async () => {
    const s = stateRef.current;
    if (!s.themeDuel) return;
    dispatch({ type: "REJECT_THEME_DUEL", payload: s.themeDuel });
    // startThemeDuel lira les rejectedThemes mis à jour via stateRef
    // On doit attendre le prochain tick pour que le reducer ait appliqué REJECT_THEME_DUEL
    await new Promise((r) => setTimeout(r, 0));
    await startThemeDuel();
  }, [startThemeDuel]);

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
      const category = lastABNode
        ? (lastABNode.choice === "A" ? lastABNode.optionA : lastABNode.optionB)
        : s.winningTheme?.slug ?? "";
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
      });

      dispatch({ type: "PUSH_DRILL_RESPONSE", payload: { response, choice, node: nodeToAdd } });

      // Rafraîchir les plumes après consommation serveur (fire-and-forget côté serveur)
      if (response.statut === "finalisé") {
        setTimeout(() => refreshPlumes(), 500);
      }
    } catch (e: any) {
      if (e instanceof NoPlumesError) {
        dispatch({ type: "SET_NEEDS_PLUMES", payload: choice });
        return;
      }
      dispatch({ type: "SET_ERROR", payload: e.message ?? i18n.t("common.unknownError") });
    }
  }, [preferencesText, deviceId, refreshPlumes]);

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
        rejected_titles: allRejected.length > 0 ? allRejected : undefined,
      });

      // Le LLM ou le serveur signale qu'il n'a plus rien à proposer
      if ((response as LLMResponse)?.statut === "épuisé") {
        const isMaxRerolls = (response as any)?.mogogo_message === "max_rerolls_reached";
        dispatch({ type: "SET_REROLL_EXHAUSTED", payload: { maxRerollsReached: isMaxRerolls } });
        return;
      }

      dispatch({ type: "PUSH_DRILL_RESPONSE", payload: { response, choice: "reroll" } });
    } catch (e: any) {
      dispatch({ type: "SET_ERROR", payload: e.message ?? i18n.t("common.unknownError") });
    }
  }, [preferencesText, deviceId]);

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
        force_finalize: true,
      });

      dispatch({ type: "PUSH_DRILL_RESPONSE", payload: { response } });

      // Rafraîchir les plumes après consommation serveur (fire-and-forget côté serveur)
      if (response.statut === "finalisé") {
        setTimeout(() => refreshPlumes(), 500);
      }
    } catch (e: any) {
      if (e instanceof NoPlumesError) {
        dispatch({ type: "SET_NEEDS_PLUMES", payload: "finalize" });
        return;
      }
      dispatch({ type: "SET_ERROR", payload: e.message ?? i18n.t("common.unknownError") });
    }
  }, [preferencesText, deviceId, refreshPlumes]);

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

  const retryAfterPlumes = useCallback(async () => {
    const pending = stateRef.current.pendingAction;
    dispatch({ type: "CLEAR_NEEDS_PLUMES" });
    if (pending === "finalize") {
      await forceDrillFinalize();
    } else if (pending === "A" || pending === "B" || pending === "neither") {
      await makeDrillChoice(pending as "A" | "B" | "neither");
    } else {
      // Premier appel drill-down (pendingAction = undefined)
      await makeDrillChoice(undefined as any);
    }
  }, [makeDrillChoice, forceDrillFinalize]);

  return (
    <FunnelCtx.Provider value={{
      state,
      setContext,
      startThemeDuel,
      rejectThemeDuel,
      selectTheme,
      makeDrillChoice,
      reroll,
      forceDrillFinalize,
      dismissPoolExhausted,
      goBack,
      reset,
      retryAfterPlumes,
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
