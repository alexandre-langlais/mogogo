import { supabase } from "./supabase";
import i18n from "@/i18n";
import type { LLMResponse, UserContext, FunnelChoice } from "@/types";

interface FunnelHistoryEntry {
  response: LLMResponse;
  choice?: FunnelChoice;
}

function validateLLMResponse(data: unknown): LLMResponse {
  if (!data || typeof data !== "object") {
    throw new Error(i18n.t("common.unknownError"));
  }

  const d = data as Record<string, unknown>;

  if (!["en_cours", "finalisé"].includes(d.statut as string)) {
    throw new Error("Invalid LLM response: bad statut");
  }

  if (
    !["questionnement", "pivot", "breakout", "resultat"].includes(
      d.phase as string,
    )
  ) {
    throw new Error("Invalid LLM response: bad phase");
  }

  if (typeof d.mogogo_message !== "string") {
    throw new Error("Invalid LLM response: missing mogogo_message");
  }

  if (d.statut === "en_cours" && !d.question) {
    throw new Error("Invalid LLM response: missing question");
  }

  if (d.statut === "finalisé" && !d.recommandation_finale) {
    throw new Error("Invalid LLM response: missing recommandation_finale");
  }

  // Normaliser : garantir que actions existe toujours dans recommandation_finale
  if (d.recommandation_finale && typeof d.recommandation_finale === "object") {
    const rec = d.recommandation_finale as Record<string, unknown>;
    if (!Array.isArray(rec.actions)) {
      rec.actions = [];
      // Migration : convertir google_maps_query en action maps
      if (rec.google_maps_query && typeof rec.google_maps_query === "string") {
        rec.actions = [{ type: "maps", label: i18n.t("result.actions.maps"), query: rec.google_maps_query }];
      }
    }
    // Normaliser tags : array de strings, fallback []
    if (!Array.isArray(rec.tags)) {
      rec.tags = [];
    } else {
      rec.tags = rec.tags.filter((t: unknown) => typeof t === "string");
    }
  }

  return data as LLMResponse;
}

const LLM_TIMEOUT_MS = 30_000;
const MAX_RETRIES = 1;
const RETRY_DELAY_MS = 1_000;

function isRetryableError(error: unknown): boolean {
  if (error instanceof Error) {
    const msg = error.message.toLowerCase();
    return msg.includes("502") || msg.includes("timeout") || msg.includes("network");
  }
  return false;
}

async function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export async function callLLMGateway(params: {
  context: UserContext;
  history?: FunnelHistoryEntry[];
  choice?: FunnelChoice;
  preferences?: string;
}): Promise<LLMResponse> {
  const { data: { session } } = await supabase.auth.getSession();

  if (!session) {
    throw new Error("Not authenticated");
  }

  let lastError: Error | null = null;

  for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
    if (attempt > 0) {
      await sleep(RETRY_DELAY_MS);
    }

    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), LLM_TIMEOUT_MS);

    try {
      const response = await supabase.functions.invoke("llm-gateway", {
        body: params,
        headers: {
          Authorization: `Bearer ${session.access_token}`,
        },
      });

      clearTimeout(timeoutId);

      if (response.error) {
        const status = (response.error as any).status;
        if (status === 429) {
          throw new Error("429: " + i18n.t("funnel.quotaError"));
        }
        throw new Error(response.error.message);
      }

      return validateLLMResponse(response.data);
    } catch (e: any) {
      clearTimeout(timeoutId);
      lastError = e instanceof Error ? e : new Error(String(e));

      if (!isRetryableError(lastError) || attempt === MAX_RETRIES) {
        throw lastError;
      }
    }
  }

  throw lastError!;
}
