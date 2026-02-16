import { supabase } from "./supabase";
import i18n from "@/i18n";
import type { LLMResponse, UserContextV3 } from "@/types";
import type { DrillDownNode } from "@/contexts/FunnelContext";

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
    if (!opts.A || (typeof opts.A === "string" && opts.A.trim() === "")) opts.A = "Option A";
    if (!opts.B || (typeof opts.B === "string" && opts.B.trim() === "")) opts.B = "Option B";
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

  if (!["en_cours", "finalisé", "épuisé"].includes(d.statut as string)) {
    throw new Error("Invalid LLM response: bad statut");
  }

  // Statut épuisé → retourner immédiatement (pas de validation supplémentaire)
  if (d.statut === "épuisé") {
    if (typeof d.mogogo_message !== "string" || !d.mogogo_message.trim()) {
      d.mogogo_message = "Je n'ai rien d'autre à te proposer, désolé !";
    }
    if (!d.phase) d.phase = "resultat";
    if (!d.metadata) d.metadata = { pivot_count: 0, current_branch: "", depth: 0 };
    return data as LLMResponse;
  }

  if (
    !["questionnement", "pivot", "breakout", "resultat"].includes(d.phase as string)
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

  // Valider et normaliser subcategories
  if (Array.isArray(d.subcategories)) {
    d.subcategories = (d.subcategories as unknown[])
      .filter((s): s is string => typeof s === "string" && s.trim().length > 0)
      .map(s => truncate(stripMarkdown(s.trim()), 60));
    if ((d.subcategories as string[]).length === 0) {
      delete d.subcategories;
    }
  }

  // Si subcategories présent mais options absent → construire depuis pool[0]/pool[1]
  if (Array.isArray(d.subcategories) && (d.subcategories as string[]).length >= 2 && (!d.options || typeof d.options !== "object")) {
    const pool = d.subcategories as string[];
    d.options = { A: pool[0], B: pool[1] };
  }

  sanitizeResponse(d);

  // Si en_cours sans question mais avec recommandation_finale → flip vers finalisé
  if (d.statut === "en_cours" && !d.question && d.recommandation_finale) {
    d.statut = "finalisé";
    d.phase = "resultat";
  }
  if (d.statut === "en_cours" && !d.question) {
    throw new Error("Invalid LLM response: missing question");
  }
  // Fallback options si manquantes
  if (d.statut === "en_cours" && d.question && (!d.options || typeof d.options !== "object")) {
    d.options = { A: "Option A", B: "Option B" };
  }

  if (d.statut === "finalisé" && !d.recommandation_finale) {
    throw new Error("Invalid LLM response: missing recommandation_finale");
  }

  // Normaliser recommandation_finale
  if (d.recommandation_finale && typeof d.recommandation_finale === "object") {
    const rec = d.recommandation_finale as Record<string, unknown>;
    if (!Array.isArray(rec.actions)) {
      rec.actions = [];
      if (rec.google_maps_query && typeof rec.google_maps_query === "string") {
        rec.actions = [{ type: "maps", label: i18n.t("result.actions.maps"), query: rec.google_maps_query }];
      }
    }
    if (Array.isArray(rec.actions) && rec.actions.length === 0 && typeof rec.titre === "string" && rec.titre.trim()) {
      rec.actions = [{ type: "web", label: "Rechercher", query: rec.titre }];
    }
    if (!rec.explication || (typeof rec.explication === "string" && !rec.explication.trim())) {
      rec.explication = (rec.titre as string) ?? "Activité recommandée par Mogogo";
    }
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

/**
 * Appel unifié vers l'Edge Function llm-gateway V3.
 *
 * Gère les 3 phases : theme_duel, drill_down, reroll.
 * Retourne les données brutes pour theme_duel (pas de validation LLMResponse),
 * ou un LLMResponse validé pour drill_down et reroll.
 */
export async function callLLMGateway(params: {
  context: UserContextV3;
  phase?: string;
  choice?: string;
  theme_slug?: string;
  drill_history?: DrillDownNode[];
  session_id?: string;
  device_id?: string;
  preferences?: string;
  rejected_themes?: string[];
  rejected_titles?: string[];
  force_finalize?: boolean;
}): Promise<any> {
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
        const status = (response.error as any).context?.status ?? (response.error as any).status;
        if (status === 402) throw new NoPlumesError();
        if (status === 429) throw new Error("429: " + i18n.t("funnel.quotaError"));
        throw new Error(response.error.message);
      }

      // Phase theme_duel retourne des données brutes (pas un LLMResponse)
      if (params.phase === "theme_duel") {
        return response.data;
      }

      return validateLLMResponse(response.data);
    } catch (e: any) {
      clearTimeout(timeoutId);
      lastError = e instanceof Error ? e : new Error(String(e));

      if (lastError instanceof NoPlumesError) throw lastError;
      if (!isRetryableError(lastError) || attempt === MAX_RETRIES) throw lastError;
    }
  }

  throw lastError!;
}
