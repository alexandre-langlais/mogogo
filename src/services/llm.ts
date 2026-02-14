import { supabase } from "./supabase";
import i18n from "@/i18n";
import type { LLMResponse, UserContext, FunnelChoice, FunnelHistoryEntry } from "@/types";

/** Erreur spécifique quand le serveur retourne 402 (plus de plumes) */
export class NoPlumesError extends Error {
  constructor() {
    super("no_plumes");
    this.name = "NoPlumesError";
  }
}

function stripMarkdown(text: string): string {
  return text
    .replace(/\*\*([^*]+)\*\*/g, "$1")
    .replace(/\*([^*]+)\*/g, "$1")
    .replace(/__([^_]+)__/g, "$1")
    .replace(/_([^_]+)_/g, "$1")
    .replace(/`([^`]+)`/g, "$1")
    .trim();
}

function truncate(t: string, maxLen: number): string {
  if (t.length <= maxLen) return t;
  const cut = t.lastIndexOf(" ", maxLen - 1);
  return (cut > maxLen * 0.4 ? t.slice(0, cut) : t.slice(0, maxLen - 1)) + "…";
}

function sanitizeResponse(d: Record<string, unknown>): void {
  if (typeof d.mogogo_message === "string") {
    d.mogogo_message = truncate(stripMarkdown(d.mogogo_message), 120);
  }
  if (typeof d.question === "string") {
    d.question = truncate(stripMarkdown(d.question), 100);
  }
  if (d.options && typeof d.options === "object") {
    const opts = d.options as Record<string, unknown>;
    if (typeof opts.A === "string") opts.A = truncate(stripMarkdown(opts.A), 60);
    if (typeof opts.B === "string") opts.B = truncate(stripMarkdown(opts.B), 60);
    if (!opts.A || (typeof opts.A === "string" && opts.A.trim() === "")) {
      opts.A = "Option A";
    }
    if (!opts.B || (typeof opts.B === "string" && opts.B.trim() === "")) {
      opts.B = "Option B";
    }
  }
  if (d.recommandation_finale && typeof d.recommandation_finale === "object") {
    const rec = d.recommandation_finale as Record<string, unknown>;
    if (typeof rec.titre === "string") rec.titre = stripMarkdown(rec.titre);
    if (typeof rec.explication === "string") rec.explication = stripMarkdown(rec.explication);
  }
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

  // Récupérer mogogo_message si manquant
  if (typeof d.mogogo_message !== "string" || !d.mogogo_message.trim()) {
    if (typeof (d as any).message === "string" && (d as any).message.trim()) {
      d.mogogo_message = (d as any).message;
    } else if (typeof d.question === "string" && d.question.trim()) {
      d.mogogo_message = "Hmm, laisse-moi réfléchir...";
    } else {
      throw new Error("Invalid LLM response: missing mogogo_message");
    }
  }

  // Sanitiser les textes (strip markdown, valider options non-vides)
  sanitizeResponse(d);

  // Normaliser les breakouts : le LLM renvoie parfois statut "en_cours" avec
  // un champ "breakout"/"breakout_options" au lieu de "finalisé" + "recommandation_finale"
  if (d.phase === "breakout" && !d.recommandation_finale) {
    const breakoutArray = (d as any).breakout ?? (d as any).breakout_options;
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
    }
  }

  // Le LLM met parfois statut "en_cours" sur un breakout qui a déjà une recommandation_finale
  if (d.phase === "breakout" && d.statut === "en_cours" && d.recommandation_finale) {
    d.statut = "finalisé";
  }

  // Si en_cours sans question mais avec recommandation_finale → flip vers finalisé
  if (d.statut === "en_cours" && !d.question && d.recommandation_finale) {
    d.statut = "finalisé";
    d.phase = "resultat";
  }
  if (d.statut === "en_cours" && !d.question) {
    throw new Error("Invalid LLM response: missing question");
  }
  // Fallback options si manquantes en en_cours (JSON tronqué avant les options)
  if (d.statut === "en_cours" && d.question && (!d.options || typeof d.options !== "object")) {
    d.options = { A: "Option A", B: "Option B" };
  }

  if (d.statut === "finalisé" && !d.recommandation_finale) {
    throw new Error("Invalid LLM response: missing recommandation_finale");
  }

  // Si en_cours sans question mais avec recommandation_finale (déjà géré ci-dessus)
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
    // Fallback : si titre présent mais actions vides, ajouter une action web
    if (Array.isArray(rec.actions) && rec.actions.length === 0 && typeof rec.titre === "string" && rec.titre.trim()) {
      rec.actions = [{ type: "web", label: "Rechercher", query: rec.titre }];
    }
    // Fallback : si explication manquante
    if (!rec.explication || (typeof rec.explication === "string" && !rec.explication.trim())) {
      rec.explication = (rec.titre as string) ?? "Activité recommandée par Mogogo";
    }
    // Normaliser tags : array de strings, filtrer les slugs invalides
    const VALID_TAGS = new Set(["sport","culture","gastronomie","nature","detente","fete","creatif","jeux","musique","cinema","voyage","tech","social","insolite"]);
    if (!Array.isArray(rec.tags)) {
      rec.tags = [];
    } else {
      rec.tags = rec.tags.filter((t: unknown) => typeof t === "string" && VALID_TAGS.has(t));
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
  session_id?: string;
  excluded_tags?: string[];
  device_id?: string;
}, options?: {
  signal?: AbortSignal;
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

    // Use external signal if provided
    if (options?.signal) {
      options.signal.addEventListener("abort", () => controller.abort());
    }

    try {
      const response = await supabase.functions.invoke("llm-gateway", {
        body: params,
        headers: {
          Authorization: `Bearer ${session.access_token}`,
        },
      });

      clearTimeout(timeoutId);

      if (response.error) {
        // FunctionsHttpError stocke le Response original dans .context
        const status = (response.error as any).context?.status ?? (response.error as any).status;
        if (status === 402) {
          throw new NoPlumesError();
        }
        if (status === 429) {
          throw new Error("429: " + i18n.t("funnel.quotaError"));
        }
        throw new Error(response.error.message);
      }

      return validateLLMResponse(response.data);
    } catch (e: any) {
      clearTimeout(timeoutId);
      lastError = e instanceof Error ? e : new Error(String(e));

      // NoPlumesError ne doit jamais être retryée
      if (lastError instanceof NoPlumesError) {
        throw lastError;
      }

      if (!isRetryableError(lastError) || attempt === MAX_RETRIES) {
        throw lastError;
      }
    }
  }

  throw lastError!;
}

/**
 * Prefetch both A and B choices in parallel (Phase 5).
 * Returns prefetched responses for each choice.
 * Does NOT retry on failure (prefetch is opportunistic).
 */
export async function prefetchLLMChoices(params: {
  context: UserContext;
  history: FunnelHistoryEntry[];
  currentResponse: LLMResponse;
  preferences?: string;
  session_id?: string;
  excluded_tags?: string[];
  device_id?: string;
}, signal?: AbortSignal): Promise<{ A?: LLMResponse; B?: LLMResponse }> {
  const { data: { session } } = await supabase.auth.getSession();
  if (!session) return {};

  const supabaseUrl = process.env.EXPO_PUBLIC_SUPABASE_URL ?? "";
  const supabaseAnonKey = process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY ?? "";
  const url = `${supabaseUrl}/functions/v1/llm-gateway`;

  const makeRequest = async (choice: FunnelChoice): Promise<LLMResponse | undefined> => {
    try {
      const historyForLLM = [
        ...params.history.map(h => ({ response: h.response, choice: h.choice })),
        { response: params.currentResponse, choice },
      ];

      const response = await fetch(url, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Authorization": `Bearer ${session.access_token}`,
          "apikey": supabaseAnonKey,
        },
        body: JSON.stringify({
          context: params.context,
          history: historyForLLM,
          choice,
          preferences: params.preferences,
          session_id: params.session_id,
          excluded_tags: params.excluded_tags,
          device_id: params.device_id,
          prefetch: true,
        }),
        signal,
      });

      if (!response.ok) return undefined;
      const data = await response.json();
      return validateLLMResponse(data);
    } catch {
      return undefined;
    }
  };

  const [a, b] = await Promise.allSettled([
    makeRequest("A"),
    makeRequest("B"),
  ]);

  return {
    A: a.status === "fulfilled" ? a.value : undefined,
    B: b.status === "fulfilled" ? b.value : undefined,
  };
}
