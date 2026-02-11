import React, { createContext, useContext, useReducer, useCallback, useRef } from "react";
import "react-native-get-random-values";
import { v4 as uuidv4 } from "uuid";
import { callLLMGateway, prefetchLLMChoices } from "@/services/llm";
import i18n from "@/i18n";
import type { LLMResponse, UserContext, FunnelChoice, FunnelHistoryEntry } from "@/types";

interface FunnelState {
  context: UserContext | null;
  sessionId: string | null;
  history: FunnelHistoryEntry[];
  currentResponse: LLMResponse | null;
  loading: boolean;
  error: string | null;
  pivotCount: number;
  lastChoice?: FunnelChoice;
  /** Prefetched responses for A and B choices */
  prefetchedResponses: { A?: LLMResponse; B?: LLMResponse } | null;
  /** Tags exclus pour le reste de la session (accumulés via reroll "Pas pour moi") */
  excludedTags: string[];
}

type FunnelAction =
  | { type: "SET_CONTEXT"; payload: UserContext }
  | { type: "SET_LOADING"; payload: boolean; choice?: FunnelChoice }
  | { type: "SET_ERROR"; payload: string | null }
  | { type: "SET_PREFETCHED"; payload: { A?: LLMResponse; B?: LLMResponse } | null }
  | { type: "PUSH_RESPONSE"; payload: { response: LLMResponse; choice?: FunnelChoice } }
  | { type: "POP_RESPONSE" }
  | { type: "JUMP_TO_STEP"; payload: { stepIndex: number } }
  | { type: "ADD_EXCLUDED_TAGS"; payload: string[] }
  | { type: "RESET" };

const initialState: FunnelState = {
  context: null,
  sessionId: null,
  history: [],
  currentResponse: null,
  loading: false,
  error: null,
  pivotCount: 0,
  prefetchedResponses: null,
  excludedTags: [],
};

function funnelReducer(state: FunnelState, action: FunnelAction): FunnelState {
  switch (action.type) {
    case "SET_CONTEXT":
      return { ...state, context: action.payload, sessionId: uuidv4() };

    case "SET_LOADING":
      return {
        ...state,
        loading: action.payload,
        error: action.payload ? null : state.error,
        ...(action.choice !== undefined && { lastChoice: action.choice }),
      };

    case "SET_ERROR":
      return { ...state, error: action.payload, loading: false };

    case "SET_PREFETCHED":
      return { ...state, prefetchedResponses: action.payload };

    case "PUSH_RESPONSE": {
      let choiceLabel: string | undefined;
      if (state.currentResponse?.options &&
          (action.payload.choice === "A" || action.payload.choice === "B")) {
        choiceLabel = state.currentResponse.options[action.payload.choice];
      }
      const newHistory = state.currentResponse
        ? [...state.history, { response: state.currentResponse, choice: action.payload.choice, choiceLabel }]
        : state.history;

      const pivotCount =
        action.payload.response.phase === "pivot"
          ? state.pivotCount + 1
          : action.payload.response.phase === "questionnement"
            ? 0
            : state.pivotCount;

      return {
        ...state,
        history: newHistory,
        currentResponse: action.payload.response,
        loading: false,
        error: null,
        pivotCount,
        lastChoice: action.payload.choice,
        // Clear prefetch when new response arrives (will be re-triggered)
        prefetchedResponses: null,
      };
    }

    case "POP_RESPONSE": {
      if (state.history.length === 0) return state;
      const newHistory = [...state.history];
      const previous = newHistory.pop()!;
      return {
        ...state,
        history: newHistory,
        currentResponse: previous.response,
        error: null,
        prefetchedResponses: null,
      };
    }

    case "JUMP_TO_STEP": {
      const { stepIndex } = action.payload;
      if (stepIndex < 0 || stepIndex >= state.history.length) return state;
      const newHistory = state.history.slice(0, stepIndex);
      return {
        ...state,
        history: newHistory,
        currentResponse: state.history[stepIndex].response,
        loading: false,
        error: null,
        pivotCount: newHistory.filter(h => h.response.phase === "pivot").length,
        prefetchedResponses: null,
      };
    }

    case "ADD_EXCLUDED_TAGS":
      return {
        ...state,
        excludedTags: [...new Set([...state.excludedTags, ...action.payload])],
      };

    case "RESET":
      return initialState;

    default:
      return state;
  }
}

interface FunnelContextValue {
  state: FunnelState;
  setContext: (ctx: UserContext) => void;
  makeChoice: (choice?: FunnelChoice) => Promise<void>;
  reroll: () => Promise<void>;
  refine: () => Promise<void>;
  jumpToStep: (stepIndex: number) => Promise<void>;
  goBack: () => void;
  reset: () => void;
}

const FunnelCtx = createContext<FunnelContextValue | null>(null);

export function FunnelProvider({ children, preferencesText }: { children: React.ReactNode; preferencesText?: string }) {
  const [state, dispatch] = useReducer(funnelReducer, initialState);

  // Ref miroir du state pour éviter les closures stale dans les callbacks async
  const stateRef = useRef(state);
  stateRef.current = state;

  const prefetchControllerRef = useRef<AbortController | null>(null);
  const prefetchPromiseRef = useRef<Promise<{ A?: LLMResponse; B?: LLMResponse }> | null>(null);

  // Cancel any in-flight prefetch
  const cancelPrefetch = useCallback(() => {
    if (prefetchControllerRef.current) {
      prefetchControllerRef.current.abort();
      prefetchControllerRef.current = null;
    }
    prefetchPromiseRef.current = null;
    dispatch({ type: "SET_PREFETCHED", payload: null });
  }, []);

  // Launch prefetch for A and B after a new response arrives
  const launchPrefetch = useCallback((
    context: UserContext,
    history: FunnelHistoryEntry[],
    currentResponse: LLMResponse,
  ) => {
    // Skip prefetch if disabled via env var
    if (process.env.EXPO_PUBLIC_DISABLE_PREFETCH === "true") return;

    // Only prefetch for in-progress responses with options
    if (currentResponse.statut !== "en_cours" || !currentResponse.options) return;

    cancelPrefetch();
    const controller = new AbortController();
    prefetchControllerRef.current = controller;

    const promise = prefetchLLMChoices({
      context,
      history,
      currentResponse,
      preferences: preferencesText,
      session_id: stateRef.current.sessionId ?? undefined,
      excluded_tags: stateRef.current.excludedTags.length > 0 ? stateRef.current.excludedTags : undefined,
    }, controller.signal).then((results) => {
      if (!controller.signal.aborted) {
        dispatch({ type: "SET_PREFETCHED", payload: results });
      }
      return results;
    }).catch(() => {
      // Prefetch is opportunistic, ignore errors
      return {} as { A?: LLMResponse; B?: LLMResponse };
    });
    prefetchPromiseRef.current = promise;
  }, [preferencesText, cancelPrefetch]);

  const setContext = useCallback((ctx: UserContext) => {
    dispatch({ type: "SET_CONTEXT", payload: ctx });
  }, []);

  const jumpToStep = useCallback(
    async (stepIndex: number) => {
      const s = stateRef.current;
      if (!s.context || stepIndex < 0 || stepIndex >= s.history.length) return;
      const truncatedHistory = s.history.slice(0, stepIndex);
      const targetResponse = s.history[stepIndex].response;
      const ctx = s.context;

      cancelPrefetch();
      dispatch({ type: "JUMP_TO_STEP", payload: { stepIndex } });
      dispatch({ type: "SET_LOADING", payload: true, choice: "neither" });

      try {
        const historyForLLM = [
          ...truncatedHistory.map(h => ({ response: h.response, choice: h.choice })),
          { response: targetResponse, choice: "neither" as FunnelChoice },
        ];
        const response = await callLLMGateway({
          context: ctx,
          history: historyForLLM,
          choice: "neither",
          preferences: preferencesText,
          session_id: stateRef.current.sessionId ?? undefined,
          excluded_tags: stateRef.current.excludedTags.length > 0 ? stateRef.current.excludedTags : undefined,
        });
        dispatch({ type: "PUSH_RESPONSE", payload: { response, choice: "neither" } });

        // Launch prefetch for the new response
        const newHistory = [...truncatedHistory, { response: targetResponse, choice: "neither" as FunnelChoice }];
        launchPrefetch(ctx, newHistory, response);
      } catch (e: any) {
        dispatch({ type: "SET_ERROR", payload: e.message ?? i18n.t("common.unknownError") });
      }
    },
    [preferencesText, cancelPrefetch, launchPrefetch],
  );

  const makeChoice = useCallback(
    async (choice?: FunnelChoice) => {
      const s = stateRef.current;
      if (!s.context) return;

      // --- A/B : Fast path — prefetched response already available ---
      if ((choice === "A" || choice === "B") && s.prefetchedResponses?.[choice]) {
        const prefetched = s.prefetchedResponses[choice]!;
        cancelPrefetch();
        dispatch({ type: "PUSH_RESPONSE", payload: { response: prefetched, choice } });

        const newHistory = s.currentResponse
          ? [...s.history, { response: s.currentResponse, choice }]
          : s.history;
        launchPrefetch(s.context, newHistory, prefetched);
        return;
      }

      // --- A/B : Wait path — prefetch in flight, await it instead of aborting ---
      if ((choice === "A" || choice === "B") && prefetchPromiseRef.current) {
        const pendingPromise = prefetchPromiseRef.current;
        dispatch({ type: "SET_LOADING", payload: true, choice });

        try {
          const results = await pendingPromise;
          if (results[choice]) {
            cancelPrefetch();
            dispatch({ type: "PUSH_RESPONSE", payload: { response: results[choice]!, choice } });
            // Re-read state ref (SET_LOADING may have re-rendered, but
            // currentResponse/history haven't changed since only SET_LOADING was dispatched)
            const s2 = stateRef.current;
            const newHistory = s2.currentResponse
              ? [...s2.history, { response: s2.currentResponse, choice }]
              : s2.history;
            launchPrefetch(s2.context!, newHistory, results[choice]!);
            return;
          }
        } catch {
          // Prefetch failed, fall through to normal call
        }
      }

      // --- Normal path: cancel prefetch, make new LLM call ---
      cancelPrefetch();
      dispatch({ type: "SET_LOADING", payload: true, choice });

      try {
        // Re-read ref for freshest state
        const cur = stateRef.current;
        const isFirstCall = !cur.currentResponse && cur.history.length === 0;

        const historyForLLM = cur.currentResponse
          ? [
              ...cur.history.map((h) => ({
                response: h.response,
                choice: h.choice,
              })),
              { response: cur.currentResponse, choice },
            ]
          : [];

        const response = await callLLMGateway({
          context: cur.context!,
          history: historyForLLM,
          choice,
          preferences: preferencesText,
          session_id: cur.sessionId ?? undefined,
          excluded_tags: cur.excludedTags.length > 0 ? cur.excludedTags : undefined,
        });

        dispatch({ type: "PUSH_RESPONSE", payload: { response, choice } });

        // Launch prefetch for the new response
        launchPrefetch(cur.context!, historyForLLM, response);
      } catch (e: any) {
        dispatch({ type: "SET_ERROR", payload: e.message ?? i18n.t("common.unknownError") });
      }
    },
    [cancelPrefetch, launchPrefetch, preferencesText],
  );

  const reroll = useCallback(async () => {
    const s = stateRef.current;
    if (!s.context || !s.currentResponse?.recommandation_finale) return;

    // Exclure les tags de la recommandation rejetée (calcul local pour éviter le décalage stateRef)
    const tags = s.currentResponse.recommandation_finale.tags ?? [];
    const mergedExcluded = [...new Set([...s.excludedTags, ...tags])];

    if (tags.length > 0) {
      dispatch({ type: "ADD_EXCLUDED_TAGS", payload: tags });
    }
    cancelPrefetch();
    dispatch({ type: "SET_LOADING", payload: true, choice: "reroll" });

    try {
      const cur = stateRef.current;
      const historyForLLM = cur.currentResponse
        ? [
            ...cur.history.map((h) => ({ response: h.response, choice: h.choice })),
            { response: cur.currentResponse, choice: "reroll" as FunnelChoice },
          ]
        : [];

      const response = await callLLMGateway({
        context: cur.context!,
        history: historyForLLM,
        choice: "reroll",
        preferences: preferencesText,
        session_id: cur.sessionId ?? undefined,
        excluded_tags: mergedExcluded.length > 0 ? mergedExcluded : undefined,
      });

      dispatch({ type: "PUSH_RESPONSE", payload: { response, choice: "reroll" } });
    } catch (e: any) {
      dispatch({ type: "SET_ERROR", payload: e.message ?? i18n.t("common.unknownError") });
    }
  }, [cancelPrefetch, preferencesText]);

  const refine = useCallback(async () => {
    await makeChoice("refine");
  }, [makeChoice]);

  const goBack = useCallback(() => {
    cancelPrefetch();
    dispatch({ type: "POP_RESPONSE" });
  }, [cancelPrefetch]);

  const reset = useCallback(() => {
    cancelPrefetch();
    dispatch({ type: "RESET" });
  }, [cancelPrefetch]);

  return (
    <FunnelCtx.Provider value={{ state, setContext, makeChoice, reroll, refine, jumpToStep, goBack, reset }}>
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
