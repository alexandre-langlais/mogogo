import React, { createContext, useContext, useReducer, useCallback } from "react";
import { callLLMGateway } from "@/services/llm";
import i18n from "@/i18n";
import type { LLMResponse, UserContext, FunnelChoice } from "@/types";

interface FunnelHistoryEntry {
  response: LLMResponse;
  choice?: FunnelChoice;
}

interface FunnelState {
  context: UserContext | null;
  history: FunnelHistoryEntry[];
  currentResponse: LLMResponse | null;
  loading: boolean;
  error: string | null;
  pivotCount: number;
  lastChoice?: FunnelChoice;
}

type FunnelAction =
  | { type: "SET_CONTEXT"; payload: UserContext }
  | { type: "SET_LOADING"; payload: boolean }
  | { type: "SET_ERROR"; payload: string | null }
  | { type: "PUSH_RESPONSE"; payload: { response: LLMResponse; choice?: FunnelChoice } }
  | { type: "POP_RESPONSE" }
  | { type: "RESET" };

const initialState: FunnelState = {
  context: null,
  history: [],
  currentResponse: null,
  loading: false,
  error: null,
  pivotCount: 0,
};

function funnelReducer(state: FunnelState, action: FunnelAction): FunnelState {
  switch (action.type) {
    case "SET_CONTEXT":
      return { ...state, context: action.payload };

    case "SET_LOADING":
      return { ...state, loading: action.payload, error: action.payload ? null : state.error };

    case "SET_ERROR":
      return { ...state, error: action.payload, loading: false };

    case "PUSH_RESPONSE": {
      const newHistory = state.currentResponse
        ? [...state.history, { response: state.currentResponse, choice: action.payload.choice }]
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
  goBack: () => void;
  reset: () => void;
}

const FunnelCtx = createContext<FunnelContextValue | null>(null);

export function FunnelProvider({ children }: { children: React.ReactNode }) {
  const [state, dispatch] = useReducer(funnelReducer, initialState);

  const setContext = useCallback((ctx: UserContext) => {
    dispatch({ type: "SET_CONTEXT", payload: ctx });
  }, []);

  const makeChoice = useCallback(
    async (choice?: FunnelChoice) => {
      if (!state.context) return;

      dispatch({ type: "SET_LOADING", payload: true });

      try {
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
        });

        dispatch({ type: "PUSH_RESPONSE", payload: { response, choice } });
      } catch (e: any) {
        dispatch({ type: "SET_ERROR", payload: e.message ?? i18n.t("common.unknownError") });
      }
    },
    [state.context, state.currentResponse, state.history],
  );

  const reroll = useCallback(async () => {
    await makeChoice("reroll");
  }, [makeChoice]);

  const refine = useCallback(async () => {
    await makeChoice("refine");
  }, [makeChoice]);

  const goBack = useCallback(() => {
    dispatch({ type: "POP_RESPONSE" });
  }, []);

  const reset = useCallback(() => {
    dispatch({ type: "RESET" });
  }, []);

  return (
    <FunnelCtx.Provider value={{ state, setContext, makeChoice, reroll, refine, goBack, reset }}>
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
