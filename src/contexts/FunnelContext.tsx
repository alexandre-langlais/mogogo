import React, { createContext, useContext, useReducer, useCallback, useRef } from "react";
import { callLLMGateway, prefetchLLMChoices } from "@/services/llm";
import i18n from "@/i18n";
import type { LLMResponse, UserContext, FunnelChoice, FunnelHistoryEntry } from "@/types";

interface FunnelState {
  context: UserContext | null;
  history: FunnelHistoryEntry[];
  currentResponse: LLMResponse | null;
  loading: boolean;
  error: string | null;
  pivotCount: number;
  lastChoice?: FunnelChoice;
  /** Prefetched responses for A and B choices */
  prefetchedResponses: { A?: LLMResponse; B?: LLMResponse } | null;
}

type FunnelAction =
  | { type: "SET_CONTEXT"; payload: UserContext }
  | { type: "SET_LOADING"; payload: boolean; choice?: FunnelChoice }
  | { type: "SET_ERROR"; payload: string | null }
  | { type: "SET_PREFETCHED"; payload: { A?: LLMResponse; B?: LLMResponse } | null }
  | { type: "PUSH_RESPONSE"; payload: { response: LLMResponse; choice?: FunnelChoice } }
  | { type: "POP_RESPONSE" }
  | { type: "JUMP_TO_STEP"; payload: { stepIndex: number } }
  | { type: "RESET" };

const initialState: FunnelState = {
  context: null,
  history: [],
  currentResponse: null,
  loading: false,
  error: null,
  pivotCount: 0,
  prefetchedResponses: null,
};

function funnelReducer(state: FunnelState, action: FunnelAction): FunnelState {
  switch (action.type) {
    case "SET_CONTEXT":
      return { ...state, context: action.payload };

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

export function FunnelProvider({ children, preferencesText, onPlumeConsumed }: { children: React.ReactNode; preferencesText?: string; onPlumeConsumed?: () => void }) {
  const [state, dispatch] = useReducer(funnelReducer, initialState);
  const prefetchControllerRef = useRef<AbortController | null>(null);

  // Cancel any in-flight prefetch
  const cancelPrefetch = useCallback(() => {
    if (prefetchControllerRef.current) {
      prefetchControllerRef.current.abort();
      prefetchControllerRef.current = null;
    }
    dispatch({ type: "SET_PREFETCHED", payload: null });
  }, []);

  // Launch prefetch for A and B after a new response arrives
  const launchPrefetch = useCallback((
    context: UserContext,
    history: FunnelHistoryEntry[],
    currentResponse: LLMResponse,
  ) => {
    // Only prefetch for in-progress responses with options
    if (currentResponse.statut !== "en_cours" || !currentResponse.options) return;

    cancelPrefetch();
    const controller = new AbortController();
    prefetchControllerRef.current = controller;

    prefetchLLMChoices({
      context,
      history,
      currentResponse,
      preferences: preferencesText,
    }, controller.signal).then((results) => {
      if (!controller.signal.aborted) {
        dispatch({ type: "SET_PREFETCHED", payload: results });
      }
    }).catch(() => {
      // Prefetch is opportunistic, ignore errors
    });
  }, [preferencesText, cancelPrefetch]);

  const setContext = useCallback((ctx: UserContext) => {
    dispatch({ type: "SET_CONTEXT", payload: ctx });
  }, []);

  const jumpToStep = useCallback(
    async (stepIndex: number) => {
      if (!state.context || stepIndex < 0 || stepIndex >= state.history.length) return;
      const truncatedHistory = state.history.slice(0, stepIndex);
      const targetResponse = state.history[stepIndex].response;
      const ctx = state.context;

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
        });
        dispatch({ type: "PUSH_RESPONSE", payload: { response, choice: "neither" } });

        // Launch prefetch for the new response
        const newHistory = [...truncatedHistory, { response: targetResponse, choice: "neither" as FunnelChoice }];
        launchPrefetch(ctx, newHistory, response);
      } catch (e: any) {
        dispatch({ type: "SET_ERROR", payload: e.message ?? i18n.t("common.unknownError") });
      }
    },
    [state.context, state.history, preferencesText, cancelPrefetch, launchPrefetch],
  );

  const makeChoice = useCallback(
    async (choice?: FunnelChoice) => {
      if (!state.context) return;

      // Check if we have a prefetched response for this choice
      if ((choice === "A" || choice === "B") && state.prefetchedResponses?.[choice]) {
        const prefetched = state.prefetchedResponses[choice]!;
        cancelPrefetch();
        dispatch({ type: "PUSH_RESPONSE", payload: { response: prefetched, choice } });

        // Launch prefetch for the prefetched response
        const newHistory = state.currentResponse
          ? [...state.history, { response: state.currentResponse, choice }]
          : state.history;
        launchPrefetch(state.context, newHistory, prefetched);
        return;
      }

      cancelPrefetch();
      dispatch({ type: "SET_LOADING", payload: true, choice });

      try {
        const isFirstCall = !state.currentResponse && state.history.length === 0;

        const historyForLLM = state.currentResponse
          ? [
              ...state.history.map((h) => ({
                response: h.response,
                choice: h.choice,
              })),
              { response: state.currentResponse, choice },
            ]
          : [];

        const response = await callLLMGateway({
          context: state.context,
          history: historyForLLM,
          choice,
          preferences: preferencesText,
        });

        dispatch({ type: "PUSH_RESPONSE", payload: { response, choice } });

        if (isFirstCall) {
          onPlumeConsumed?.();
        }

        // Launch prefetch for the new response
        launchPrefetch(state.context!, historyForLLM, response);
      } catch (e: any) {
        dispatch({ type: "SET_ERROR", payload: e.message ?? i18n.t("common.unknownError") });
      }
    },
    [state.context, state.currentResponse, state.history, state.prefetchedResponses, preferencesText, onPlumeConsumed, cancelPrefetch, launchPrefetch],
  );

  const reroll = useCallback(async () => {
    await makeChoice("reroll");
  }, [makeChoice]);

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
