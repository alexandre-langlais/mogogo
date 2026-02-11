#!/usr/bin/env npx tsx
/**
 * CLI Mogogo — Joue des sessions complètes sans passer par l'app mobile ni Supabase.
 *
 * Usage :
 *   npx tsx scripts/cli-session.ts --batch --context '{"social":"Amis","energy":4,"budget":"Standard","environment":"Extérieur"}' --choices "A,B,A" --json
 *   npx tsx scripts/cli-session.ts --social "Amis" --energy 4 --budget "Standard" --env "Extérieur"
 */

import { readFileSync, writeFileSync } from "node:fs";
import { createInterface } from "node:readline";
import { resolve } from "node:path";
import { createProvider, type LLMProvider } from "./lib/llm-providers.js";
import { getSystemPrompt, getPromptTier, LANGUAGE_INSTRUCTIONS, describeContext } from "../supabase/functions/_shared/system-prompts.js";
import { buildFirstQuestion, buildDiscoveryState, buildExplicitMessages } from "../supabase/functions/_shared/discovery-state.js";

// ---------------------------------------------------------------------------
// Charger .env.cli
// ---------------------------------------------------------------------------
try {
  const envPath = resolve(import.meta.dirname ?? ".", "../.env.cli");
  const envContent = readFileSync(envPath, "utf-8");
  for (const line of envContent.split("\n")) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const eqIdx = trimmed.indexOf("=");
    if (eqIdx === -1) continue;
    const key = trimmed.slice(0, eqIdx).trim();
    const value = trimmed.slice(eqIdx + 1).trim();
    if (!process.env[key]) process.env[key] = value;
  }
} catch {
  // .env.cli absent → on compte sur les env vars déjà définies
}

// ---------------------------------------------------------------------------
// Types (copiés depuis src/types/index.ts — pas d'import alias @/ avec tsx)
// ---------------------------------------------------------------------------
type ActionType = "maps" | "web" | "steam" | "play_store" | "youtube" | "streaming" | "spotify";
interface Action { type: ActionType; label: string; query: string; }

interface LLMResponse {
  statut: "en_cours" | "finalisé";
  phase: "questionnement" | "pivot" | "breakout" | "resultat";
  mogogo_message: string;
  question?: string;
  options?: { A: string; B: string };
  recommandation_finale?: {
    titre: string;
    explication: string;
    google_maps_query?: string;
    actions: Action[];
    tags?: string[];
  };
  metadata: { pivot_count: number; current_branch: string; depth?: number };
}

interface UserContext {
  social: string;
  energy: number;
  budget: string;
  environment: string;
  location?: { latitude: number; longitude: number };
  timing?: string;
  language?: string;
  children_ages?: { min: number; max: number };
}

type FunnelChoice = "A" | "B" | "neither" | "any" | "reroll" | "refine" | "finalize";

interface HistoryEntry {
  response: LLMResponse;
  choice?: FunnelChoice;
  choiceLabel?: string;
}

interface SessionStep {
  step: number;
  response: LLMResponse;
  choice?: FunnelChoice;
  latencyMs: number;
}

interface SessionResult {
  steps: SessionStep[];
  totalDurationMs: number;
  finalResponse?: LLMResponse;
  pivotCount: number;
}

// ---------------------------------------------------------------------------
// Configuration LLM
// ---------------------------------------------------------------------------
// --- Minimum depth before finalization (configurable) ---
const MIN_DEPTH = Math.max(2, parseInt(process.env.MIN_DEPTH ?? "4", 10));

// --- Fast model (navigation funnel) ---
const LLM_API_URL = process.env.LLM_API_URL ?? "http://localhost:11434/v1";
const LLM_MODEL = process.env.LLM_MODEL ?? "gpt-oss:120b-cloud";
const LLM_API_KEY = process.env.LLM_API_KEY ?? "";
const LLM_TEMPERATURE = parseFloat(process.env.LLM_TEMPERATURE ?? "0.7");
const LLM_TIMEOUT_MS = 60_000;
const fastProvider: LLMProvider = createProvider(LLM_API_URL, LLM_MODEL, LLM_API_KEY);

// --- Big model (finalisation) — optionnel, si absent le fast model fait tout ---
const LLM_FINAL_API_URL = process.env.LLM_FINAL_API_URL;
const LLM_FINAL_MODEL = process.env.LLM_FINAL_MODEL;
const LLM_FINAL_API_KEY = process.env.LLM_FINAL_API_KEY ?? "";
const hasBigModel = !!(LLM_FINAL_API_URL && LLM_FINAL_MODEL);
const bigProvider: LLMProvider | null = hasBigModel ? createProvider(LLM_FINAL_API_URL!, LLM_FINAL_MODEL!, LLM_FINAL_API_KEY) : null;

const DEFAULT_SYSTEM_PROMPT = getSystemPrompt(process.env.LLM_MODEL ?? "gpt-oss:120b-cloud", MIN_DEPTH);

// ---------------------------------------------------------------------------
// Sanitisation — strip markdown et nettoyer les textes
// ---------------------------------------------------------------------------
function stripMarkdown(text: string): string {
  return text
    .replace(/\*\*([^*]+)\*\*/g, "$1")  // **bold** → bold
    .replace(/\*([^*]+)\*/g, "$1")       // *italic* → italic
    .replace(/__([^_]+)__/g, "$1")       // __bold__ → bold
    .replace(/_([^_]+)_/g, "$1")         // _italic_ → italic
    .replace(/`([^`]+)`/g, "$1")         // `code` → code
    .trim();
}

function truncate(t: string, maxLen: number): string {
  if (t.length <= maxLen) return t;
  const cut = t.lastIndexOf(" ", maxLen - 1);
  return (cut > maxLen * 0.4 ? t.slice(0, cut) : t.slice(0, maxLen - 1)) + "…";
}

function sanitizeResponse(d: Record<string, unknown>): void {
  // Strip markdown + tronquer mogogo_message
  if (typeof d.mogogo_message === "string") {
    d.mogogo_message = truncate(stripMarkdown(d.mogogo_message), 120);
  }
  // Strip markdown + tronquer question
  if (typeof d.question === "string") {
    d.question = truncate(stripMarkdown(d.question), 100);
  }
  // Strip markdown, tronquer et valider options non-vides
  if (d.options && typeof d.options === "object") {
    const opts = d.options as Record<string, unknown>;
    if (typeof opts.A === "string") opts.A = truncate(stripMarkdown(opts.A), 60);
    if (typeof opts.B === "string") opts.B = truncate(stripMarkdown(opts.B), 60);
    if (!opts.A || (typeof opts.A === "string" && opts.A.trim() === "")) {
      console.error("  ⚠️  Option A vide détectée, fallback");
      opts.A = "Option A";
    }
    if (!opts.B || (typeof opts.B === "string" && opts.B.trim() === "")) {
      console.error("  ⚠️  Option B vide détectée, fallback");
      opts.B = "Option B";
    }
  }
  // Strip markdown de recommandation_finale
  if (d.recommandation_finale && typeof d.recommandation_finale === "object") {
    const rec = d.recommandation_finale as Record<string, unknown>;
    if (typeof rec.titre === "string") rec.titre = stripMarkdown(rec.titre);
    if (typeof rec.explication === "string") rec.explication = stripMarkdown(rec.explication);
  }
}

// ---------------------------------------------------------------------------
// Validation (synchronisée avec src/services/llm.ts)
// ---------------------------------------------------------------------------
function validateLLMResponse(data: unknown): LLMResponse {
  if (!data || typeof data !== "object") {
    throw new Error("Réponse LLM invalide : objet attendu");
  }
  const d = data as Record<string, unknown>;

  // Le LLM copie parfois le format compressé de l'historique (q/A/B au lieu du format complet)
  // Tenter de reconstruire une réponse valide
  if (!d.statut && d.q && (d.A || d.B)) {
    d.statut = "en_cours";
    d.phase = d.phase ?? "questionnement";
    d.question = d.q as string;
    d.options = { A: (d.A as string) ?? "", B: (d.B as string) ?? "" };
    if (!d.mogogo_message) d.mogogo_message = "Hmm, voyons...";
    if (!d.metadata) {
      d.metadata = {
        pivot_count: 0,
        current_branch: (d.branch as string) ?? "Racine",
        depth: (d.depth as number) ?? 1,
      };
    }
    console.error("  ⚠️  Réponse compressée détectée, reconstruction");
  }

  if (!["en_cours", "finalisé"].includes(d.statut as string)) {
    throw new Error("Réponse LLM invalide : statut manquant ou incorrect");
  }
  if (
    !["questionnement", "pivot", "breakout", "resultat"].includes(
      d.phase as string,
    )
  ) {
    throw new Error("Réponse LLM invalide : phase manquante ou incorrecte");
  }
  // Récupérer mogogo_message si manquant
  if (typeof d.mogogo_message !== "string" || !d.mogogo_message.trim()) {
    // Tenter de récupérer depuis d'autres champs ou fournir un fallback
    if (typeof d.message === "string" && d.message.trim()) {
      d.mogogo_message = d.message;
      console.error("  ⚠️  mogogo_message absent, récupéré depuis 'message'");
    } else if (typeof d.question === "string" && d.question.trim()) {
      d.mogogo_message = "Hmm, laisse-moi réfléchir...";
      console.error("  ⚠️  mogogo_message absent, fallback utilisé");
    } else {
      throw new Error("Réponse LLM invalide : mogogo_message manquant");
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
    console.error("  ⚠️  en_cours sans question mais avec reco → flip vers finalisé");
  }
  if (d.statut === "en_cours" && !d.question) {
    throw new Error(
      "Réponse LLM invalide : question manquante en phase en_cours",
    );
  }
  // Fallback options si manquantes en en_cours (JSON tronqué avant les options)
  if (d.statut === "en_cours" && d.question && (!d.options || typeof d.options !== "object")) {
    d.options = { A: "Option A", B: "Option B" };
    console.error("  ⚠️  Options manquantes, fallback utilisé");
  }
  if (d.statut === "finalisé" && !d.recommandation_finale) {
    throw new Error(
      "Réponse LLM invalide : recommandation_finale manquante en phase finalisé",
    );
  }
  // Normaliser : garantir que actions et tags existent toujours dans recommandation_finale
  if (d.recommandation_finale && typeof d.recommandation_finale === "object") {
    const rec = d.recommandation_finale as Record<string, unknown>;
    if (!Array.isArray(rec.actions)) {
      rec.actions = [];
      if (rec.google_maps_query && typeof rec.google_maps_query === "string") {
        rec.actions = [{ type: "maps", label: "Voir sur Maps", query: rec.google_maps_query }];
      }
    }
    // Fallback : si titre présent mais actions vides, ajouter une action web générique
    if (Array.isArray(rec.actions) && rec.actions.length === 0 && typeof rec.titre === "string" && rec.titre.trim()) {
      rec.actions = [{ type: "web", label: "Rechercher", query: rec.titre }];
      console.error("  ⚠️  Actions vides, fallback web ajouté");
    }
    // Fallback : si explication manquante
    if (!rec.explication || (typeof rec.explication === "string" && !rec.explication.trim())) {
      rec.explication = rec.titre ?? "Activité recommandée par Mogogo";
      console.error("  ⚠️  Explication manquante, fallback utilisé");
    }
    if (!Array.isArray(rec.tags)) {
      rec.tags = [];
    } else {
      rec.tags = (rec.tags as unknown[]).filter((t: unknown) => typeof t === "string");
    }
  }
  // Garantir metadata
  if (!d.metadata || typeof d.metadata !== "object") {
    d.metadata = { pivot_count: 0, current_branch: "Racine", depth: 1 };
  }
  return data as LLMResponse;
}

// ---------------------------------------------------------------------------
// Appel LLM
// ---------------------------------------------------------------------------
async function callLLM(
  context: UserContext,
  history: HistoryEntry[],
  choice?: FunnelChoice,
  systemPrompt?: string,
  useBigModel?: boolean,
): Promise<{ response: LLMResponse; latencyMs: number; modelUsed: string }> {
  const activeUseBig = useBigModel && hasBigModel;
  const activeModel = activeUseBig ? LLM_FINAL_MODEL! : LLM_MODEL;
  const activeProvider = activeUseBig ? bigProvider! : fastProvider;
  const lang = context.language ?? "fr";

  // --- DiscoveryState : tier du fast model ---
  const tier = getPromptTier(LLM_MODEL);
  const isFirstCall = history.length === 0 && !choice;
  const isDirectFinal = choice === "finalize" || choice === "reroll";
  const useDiscoveryState = tier === "explicit" && !isDirectFinal && choice !== "refine" && !systemPrompt;

  // Q1 pré-construite (tier explicit, premier appel)
  if (tier === "explicit" && isFirstCall && !systemPrompt) {
    console.error("  [discovery] Pre-built Q1 (no LLM call)");
    const firstQ = buildFirstQuestion(context as unknown as Record<string, unknown>, lang);
    return {
      response: validateLLMResponse(firstQ),
      latencyMs: 0,
      modelUsed: "pre-built-q1",
    };
  }

  let messages: Array<{ role: string; content: string }>;

  if (useDiscoveryState) {
    // --- Mode DiscoveryState : prompt simplifié + instruction serveur ---
    console.error("  [discovery] Building explicit messages");
    const describedCtx = describeContext(context as unknown as Record<string, unknown>, lang);
    const state = buildDiscoveryState(
      describedCtx,
      history as Array<{ choice?: string; response?: { question?: string; options?: Record<string, string>; metadata?: Record<string, unknown> } }>,
      choice,
      lang,
      MIN_DEPTH,
    );
    messages = buildExplicitMessages(state, lang, LANGUAGE_INSTRUCTIONS[lang]);
  } else {
    // --- Mode classique : prompt complet + historique conversationnel ---
    const activeSystemPrompt = systemPrompt ?? getSystemPrompt(activeModel, MIN_DEPTH);
    messages = [
      { role: "system", content: activeSystemPrompt },
    ];

    if (LANGUAGE_INSTRUCTIONS[lang]) {
      messages.push({ role: "system", content: LANGUAGE_INSTRUCTIONS[lang] });
    }

    const describedContext = describeContext(context as unknown as Record<string, unknown>, lang);
    messages.push({
      role: "user",
      content: `Contexte utilisateur : ${JSON.stringify(describedContext)}`,
    });

    // Enrichissement temporel pour les dates précises
    if (context.timing && context.timing !== "now") {
      const date = new Date(context.timing + "T12:00:00");
      if (!isNaN(date.getTime())) {
        const localeMap: Record<string, string> = { fr: "fr-FR", en: "en-US", es: "es-ES" };
        const locale = localeMap[lang] ?? "en-US";
        const dayName = date.toLocaleDateString(locale, { weekday: "long" });
        const dayNum = date.getDate();
        const month = date.toLocaleDateString(locale, { month: "long" });
        const year = date.getFullYear();
        const m = date.getMonth();
        const seasonNames: Record<string, Record<string, string>> = {
          fr: { spring: "printemps", summer: "été", autumn: "automne", winter: "hiver" },
          en: { spring: "spring", summer: "summer", autumn: "autumn", winter: "winter" },
          es: { spring: "primavera", summer: "verano", autumn: "otoño", winter: "invierno" },
        };
        const seasonKey = m >= 2 && m <= 4 ? "spring" : m >= 5 && m <= 7 ? "summer" : m >= 8 && m <= 10 ? "autumn" : "winter";
        const season = seasonNames[lang]?.[seasonKey] ?? seasonNames.en[seasonKey];
        const templates: Record<string, string> = {
          fr: `Info temporelle : l'activité est prévue pour le ${dayName} ${dayNum} ${month} ${year} (saison : ${season}).`,
          en: `Temporal info: the activity is planned for ${dayName} ${dayNum} ${month} ${year} (season: ${season}).`,
          es: `Info temporal: la actividad está prevista para el ${dayName} ${dayNum} de ${month} de ${year} (temporada: ${season}).`,
        };
        messages.push({
          role: "user",
          content: templates[lang] ?? templates.en,
        });
      }
    }

    // Helper: compute depth (consecutive A/B choices) at a given position in history
    function computeDepthAt(hist: HistoryEntry[], endIdx: number): { depth: number; chosenPath: string[] } {
      let depth = 1;
      const chosenPath: string[] = [];
      for (let i = endIdx; i >= 0; i--) {
        const c = hist[i]?.choice;
        if (c === "A" || c === "B") {
          depth++;
          const opts = hist[i]?.response?.options;
          if (opts && opts[c]) {
            chosenPath.unshift(opts[c]);
          }
        } else {
          break;
        }
      }
      return { depth, chosenPath };
    }

    // Historique compressé (comme l'Edge Function) pour économiser des tokens
    for (let idx = 0; idx < history.length; idx++) {
      const entry = history[idx];
      const r = entry.response;
      const compressed: Record<string, unknown> = {
        q: r.question,
        A: r.options?.A,
        B: r.options?.B,
        phase: r.phase,
      };
      if (r.metadata?.current_branch) compressed.branch = r.metadata.current_branch;
      if (r.metadata?.depth) compressed.depth = r.metadata.depth;
      messages.push({ role: "assistant", content: JSON.stringify(compressed) });
      if (entry.choice) {
        messages.push({ role: "user", content: `Choix : ${entry.choice}` });
      }
    }

    // Post-refine enforcement
    if (history.length > 0 && choice && choice !== "refine") {
      let refineIdx = -1;
      for (let i = history.length - 1; i >= 0; i--) {
        if (history[i].choice === "refine") { refineIdx = i; break; }
      }
      if (refineIdx >= 0) {
        const questionsSinceRefine = history.length - 1 - refineIdx;
        if (questionsSinceRefine < 2) {
          const remaining = 2 - questionsSinceRefine;
          messages.push({ role: "system", content: `DIRECTIVE SYSTÈME : Affinage en cours (${questionsSinceRefine}/2 questions posées). Tu DOIS poser encore au minimum ${remaining} question(s) ciblée(s) sur l'activité (durée, ambiance, format, lieu...) avant de finaliser. Réponds OBLIGATOIREMENT avec statut "en_cours" et phase "questionnement".` });
        }
      }
    }

    if (choice) {
      if (choice === "neither" && history.length > 0) {
        const { depth, chosenPath } = computeDepthAt(history, history.length - 1);
        if (depth >= 2) {
          const parentTheme = chosenPath[chosenPath.length - 1] ?? chosenPath[0] ?? "ce thème";
          messages.push({
            role: "system",
            content: `DIRECTIVE SYSTÈME : L'utilisateur a rejeté ces deux sous-options PRÉCISES, mais il aime toujours la catégorie parente "${parentTheme}". Tu DOIS rester dans ce thème et proposer deux alternatives RADICALEMENT DIFFÉRENTES au sein de "${parentTheme}". NE CHANGE PAS de catégorie. Profondeur = ${depth}, chemin = "${chosenPath.join(" > ")}".`,
          });
        } else {
          messages.push({
            role: "system",
            content: `DIRECTIVE SYSTÈME : Pivot complet. L'utilisateur rejette dès la racine. Change totalement d'angle d'attaque.`,
          });
        }
        messages.push({ role: "user", content: `Choix : neither` });
      } else if (choice === "finalize") {
        messages.push({
          role: "system",
          content: `DIRECTIVE SYSTÈME : L'utilisateur veut un résultat MAINTENANT. Tu DOIS répondre avec statut "finalisé", phase "resultat" et une recommandation_finale concrète basée sur les choix déjà faits dans l'historique. Ne pose AUCUNE question supplémentaire.`,
        });
        messages.push({ role: "user", content: `Choix : finalize` });
      } else if (choice === "refine") {
        messages.push({
          role: "system",
          content: `DIRECTIVE SYSTÈME : L'utilisateur veut AFFINER sa recommandation. Tu DOIS poser au minimum 2 questions ciblées sur l'activité recommandée (durée, ambiance, format, lieu précis...) AVANT de finaliser. Réponds avec statut "en_cours", phase "questionnement". NE finalise PAS maintenant.`,
        });
        messages.push({ role: "user", content: `Choix : refine` });
      } else {
        messages.push({ role: "user", content: `Choix : ${choice}` });
      }
    }
  } // fin du mode classique

  // max_tokens adaptatif
  const isFinalStep = choice === "finalize" || choice === "reroll";
  const maxTokens = isFinalStep || activeUseBig ? 3000 : 2000;

  const start = Date.now();
  let modelUsed = activeModel;
  const result = await activeProvider.call({
    model: activeModel,
    messages,
    temperature: LLM_TEMPERATURE,
    maxTokens,
  });

  let content = result.content;

  // Interception : si le fast model finalise et qu'on a un big model, re-appeler
  if (hasBigModel && !activeUseBig) {
    try {
      const fastParsed = JSON.parse(content);
      const isFastFinalized = fastParsed.statut === "finalisé" || fastParsed.phase === "breakout";
      if (isFastFinalized) {
        console.error(`  [intercept] Fast model finalized — calling big model (${LLM_FINAL_MODEL})`);
        const bigMessages = [...messages];
        bigMessages[0] = { role: "system", content: getSystemPrompt(LLM_FINAL_MODEL!, MIN_DEPTH) };
        bigMessages.push({
          role: "system",
          content: `DIRECTIVE SYSTÈME : Tu DOIS maintenant finaliser avec statut "finalisé", phase "resultat" et une recommandation_finale concrète. Base-toi sur tout l'historique de conversation pour proposer l'activité la plus pertinente.`,
        });
        try {
          const bigResult = await bigProvider!.call({
            model: LLM_FINAL_MODEL!,
            messages: bigMessages,
            temperature: LLM_TEMPERATURE,
            maxTokens: 3000,
          });
          content = bigResult.content;
          modelUsed = LLM_FINAL_MODEL!;
          console.error(`  [intercept] Big model succeeded`);
        } catch (bigErr: any) {
          console.error(`  [intercept] Big model failed, keeping fast response: ${bigErr.message}`);
        }
      }
    } catch {
      // JSON parse failed — will be caught below
    }
  }

  const parsed = JSON.parse(content);
  const response = validateLLMResponse(parsed);
  return { response, latencyMs: Date.now() - start, modelUsed };
}

// ---------------------------------------------------------------------------
// Affichage
// ---------------------------------------------------------------------------
function printBreadcrumb(history: HistoryEntry[]) {
  const labels = history
    .filter((h): h is HistoryEntry & { choice: "A" | "B" } => h.choice === "A" || h.choice === "B")
    .map(h => h.response.options?.[h.choice] ?? h.choice);
  if (labels.length > 0) {
    console.error(`  📍 ${labels.join(" > ")}`);
  }
}

function printStep(
  step: number,
  response: LLMResponse,
  latencyMs: number,
  choice?: FunnelChoice,
  jsonMode = false,
  modelUsed?: string,
) {
  if (jsonMode) {
    const obj: SessionStep = { step, response, latencyMs, ...(choice !== undefined ? { choice } : {}) };
    process.stdout.write(JSON.stringify(obj) + "\n");
    return;
  }

  const phaseTag = `[${response.phase}]`.padEnd(18);
  const modelTag = modelUsed && modelUsed !== LLM_MODEL ? ` [${modelUsed}]` : "";
  console.error(`\n── Step ${step} ${phaseTag} (${latencyMs}ms)${modelTag} ──`);
  console.error(`🦉 ${response.mogogo_message}`);

  if (response.statut === "en_cours" && response.question) {
    console.error(`\n❓ ${response.question}`);
    if (response.options) {
      console.error(`   A) ${response.options.A}`);
      console.error(`   B) ${response.options.B}`);
    }
  }

  if (response.recommandation_finale?.titre) {
    const rec = response.recommandation_finale;
    console.error(`\n🎯 ${rec.titre}`);
    console.error(`   ${rec.explication}`);
    const ACTION_ICONS: Record<string, string> = {
      maps: "📍", steam: "🎮", web: "🌐", youtube: "▶️",
      play_store: "📱", streaming: "🎬", spotify: "🎵",
    };
    if (rec.actions?.length) {
      for (const a of rec.actions) {
        console.error(`   ${ACTION_ICONS[a.type] ?? "🔗"} [${a.type}] ${a.label} → ${a.query}`);
      }
    }
    if (rec.tags?.length) {
      console.error(`   🏷️  ${rec.tags.join(", ")}`);
    }
  }

  if (response.metadata) {
    console.error(
      `   pivot_count=${response.metadata.pivot_count}  branch=${response.metadata.current_branch}`,
    );
  }

  if (choice !== undefined) {
    console.error(`   → Choix : ${choice}`);
  }
}

// ---------------------------------------------------------------------------
// Providers de choix
// ---------------------------------------------------------------------------
type ChoiceProvider = (currentResponse: LLMResponse) => Promise<FunnelChoice>;

function batchProvider(choices: FunnelChoice[]): ChoiceProvider {
  let idx = 0;
  return async (_response: LLMResponse) => {
    if (idx < choices.length) return choices[idx++];
    return "A"; // défaut si épuisé
  };
}

function interactiveProvider(): ChoiceProvider {
  const rl = createInterface({ input: process.stdin, output: process.stderr });
  return (response: LLMResponse) =>
    new Promise<FunnelChoice>((resolve) => {
      const prompt = response.statut === "finalisé"
        ? "\nReroll ? (reroll / n) : "
        : "\nChoix (A / B / neither / any / /back [N]) : ";
      rl.question(
        prompt,
        (answer: string) => {
          const cleaned = answer.trim();
          const backMatch = cleaned.match(/^\/back\s*(\d*)$/i);
          if (backMatch) {
            const idx = backMatch[1] ? parseInt(backMatch[1], 10) : undefined;
            resolve(`__back:${idx ?? "last"}` as FunnelChoice);
            return;
          }
          const lower = cleaned.toLowerCase();
          if (["a", "b", "neither", "any", "reroll"].includes(lower)) {
            resolve(lower === "a" ? "A" : lower === "b" ? "B" : (lower as FunnelChoice));
          } else if (response.statut === "finalisé") {
            resolve("A"); // pas de reroll → fin
          } else {
            console.error(`  Choix invalide "${answer}", défaut → A`);
            resolve("A");
          }
        },
      );
    });
}

function parseAutoChoice(raw: string): FunnelChoice {
  const result = parseAutoChoiceInner(raw);
  console.error(`   [auto] → ${result}`);
  return result;
}

function parseAutoChoiceInner(raw: string): FunnelChoice {
  if (!raw) return "A";

  // 1. Priorité absolue : dernière ligne non-vide (format attendu du prompt)
  const lines = raw.split("\n").map((l: string) => l.trim()).filter((l: string) => l.length > 0);
  const lastLine = (lines.at(-1) ?? "").toUpperCase().replace(/[^A-Z]/g, "");
  if (lastLine === "A" || lastLine === "B") return lastLine as FunnelChoice;
  if (lastLine === "NEITHER" || lastLine === "AUCUNE" || lastLine === "AUCUNEDESDEUX") return "neither";
  if (lastLine === "ANY") return "any";

  // 2. Dernières lignes courtes (≤ 30 chars) — le LLM met parfois un résumé avant la lettre
  for (let i = lines.length - 1; i >= Math.max(0, lines.length - 3); i--) {
    const short = lines[i].toUpperCase().replace(/[^A-Z]/g, "");
    if (short === "A" || short === "B") return short as FunnelChoice;
    if (lines[i].length <= 30) {
      if (short.includes("NEITHER") || short.includes("AUCUNE")) return "neither";
      if (short.includes("ANY") || short.includes("INDIFFEREN")) return "any";
    }
  }

  // 3. Pattern explicite dans tout le texte ("choix B", "option A", "réponse : B")
  const upper = raw.toUpperCase();
  const explicitMatches = [...upper.matchAll(/(?:CHOIX|OPTION|RÉPONSE|ANSWER|FINAL|CONCLUS)[^A-Z]{0,5}([AB])\b/g)];
  if (explicitMatches.length > 0) return explicitMatches.at(-1)![1] as FunnelChoice;

  // 4. Dernier recours : dernière lettre A ou B isolée
  const isolated = [...upper.matchAll(/(?:^|[^A-Z])([AB])(?:[^A-Z]|$)/g)];
  if (isolated.length > 0) return isolated.at(-1)![1] as FunnelChoice;

  return "A";
}

function autoProvider(persona: string): ChoiceProvider {
  return async (currentResponse: LLMResponse) => {
    const prompt = `Tu es un utilisateur avec cette intention précise : "${persona}"

On te propose cette question :
"${currentResponse.question}"
  A) ${currentResponse.options?.A}
  B) ${currentResponse.options?.B}

Analyse chaque option par rapport à ton intention, puis donne ta réponse finale.
Format strict — dernière ligne = uniquement la lettre choisie : A ou B (ou neither si aucune ne correspond, any si les deux conviennent).`;

    try {
      const result = await fastProvider.call({
        model: LLM_MODEL,
        messages: [{ role: "user", content: prompt }],
        temperature: 0.3,
        maxTokens: 500,
        jsonMode: false,
      });
      return parseAutoChoice(result.content);
    } catch (err: any) {
      console.error(`⚠️  Auto-provider LLM error: ${err.message}, fallback → A`);
      return "A";
    }
  };
}

// ---------------------------------------------------------------------------
// Session
// ---------------------------------------------------------------------------
async function runSession(
  context: UserContext,
  choiceProvider: ChoiceProvider,
  options: { systemPrompt?: string; maxSteps?: number; jsonMode?: boolean } = {},
): Promise<SessionResult> {
  const maxSteps = options.maxSteps ?? 20;
  const history: HistoryEntry[] = [];
  const steps: SessionStep[] = [];
  const sessionStart = Date.now();

  let rerollCount = 0;

  // Appel initial (pas de choix)
  const initial = await callLLM(context, history, undefined, options.systemPrompt);
  steps.push({ step: 1, response: initial.response, latencyMs: initial.latencyMs });
  printStep(1, initial.response, initial.latencyMs, undefined, options.jsonMode, initial.modelUsed);

  if (initial.response.statut === "finalisé") {
    return {
      steps,
      totalDurationMs: Date.now() - sessionStart,
      finalResponse: initial.response,
      pivotCount: initial.response.metadata?.pivot_count ?? 0,
    };
  }

  let currentResponse = initial.response;

  for (let i = 2; i <= maxSteps; i++) {
    const choice = await choiceProvider(currentResponse);

    // Time travel via /back [N]
    if (typeof choice === "string" && choice.startsWith("__back:")) {
      const rawIdx = choice.replace("__back:", "");
      const targetIdx = rawIdx === "last"
        ? history.length - 1
        : parseInt(rawIdx, 10);

      if (targetIdx < 0 || targetIdx >= history.length) {
        console.error(`  Index invalide: ${targetIdx} (0-${history.length - 1})`);
        i--;
        continue;
      }

      const truncated = history.slice(0, targetIdx);
      const target = history[targetIdx].response;
      const llmHistory: HistoryEntry[] = [...truncated, { response: target, choice: "neither" as FunnelChoice }];

      history.length = 0;
      history.push(...truncated);

      console.error(`\n  [time-travel] Retour au step ${targetIdx}`);
      printBreadcrumb(history);

      const result = await callLLM(context, llmHistory, "neither", options.systemPrompt);
      history.push({ response: target, choice: "neither" as FunnelChoice });
      currentResponse = result.response;

      steps.push({ step: i, response: result.response, choice: "neither" as FunnelChoice, latencyMs: result.latencyMs });
      printStep(i, result.response, result.latencyMs, "neither" as FunnelChoice, options.jsonMode, result.modelUsed);
      printBreadcrumb(history);
      continue;
    }

    // Routage dual-model : reroll/finalize → big model
    const useBig = choice === "reroll" || choice === "finalize";
    history.push({ response: currentResponse, choice });

    const result = await callLLM(context, history, undefined, options.systemPrompt, useBig);
    steps.push({ step: i, response: result.response, choice, latencyMs: result.latencyMs });
    printStep(i, result.response, result.latencyMs, choice, options.jsonMode, result.modelUsed);
    printBreadcrumb(history);

    currentResponse = result.response;

    if (currentResponse.statut === "finalisé") {
      // En batch/interactif : vérifier si le prochain choix est "reroll"
      const nextChoice = await choiceProvider(currentResponse);
      if (nextChoice === "reroll" && rerollCount < 1) {
        rerollCount++;
        history.push({ response: currentResponse, choice: nextChoice });
        const rerollResult = await callLLM(context, history, undefined, options.systemPrompt, true);
        i++;
        steps.push({ step: i, response: rerollResult.response, choice: nextChoice, latencyMs: rerollResult.latencyMs });
        printStep(i, rerollResult.response, rerollResult.latencyMs, nextChoice, options.jsonMode, rerollResult.modelUsed);
        currentResponse = rerollResult.response;
        continue;
      } else if (nextChoice === "reroll") {
        console.error(`  ⚠️  Limite reroll atteinte (max 1 par session)`);
      }
      return {
        steps,
        totalDurationMs: Date.now() - sessionStart,
        finalResponse: currentResponse,
        pivotCount: currentResponse.metadata?.pivot_count ?? 0,
      };
    }
  }

  console.error(`\n⚠️  Max steps (${maxSteps}) atteint sans finalisation.`);
  return {
    steps,
    totalDurationMs: Date.now() - sessionStart,
    pivotCount: currentResponse.metadata?.pivot_count ?? 0,
  };
}

// ---------------------------------------------------------------------------
// Parsing CLI
// ---------------------------------------------------------------------------
function parseArgs(argv: string[]) {
  const args = argv.slice(2);
  const opts: Record<string, string | boolean> = {};
  for (let i = 0; i < args.length; i++) {
    const arg = args[i];
    if (arg === "--batch") {
      opts.batch = true;
    } else if (arg === "--auto") {
      opts.auto = true;
    } else if (arg === "--json") {
      opts.json = true;
    } else if (
      ["--context", "--choices", "--prompt-file", "--transcript", "--max-steps",
        "--social", "--energy", "--budget", "--env", "--persona", "--timing", "--lang",
        "--children-ages"].includes(arg)
    ) {
      opts[arg.replace(/^--/, "")] = args[++i] ?? "";
    } else if (arg === "--help" || arg === "-h") {
      opts.help = true;
    }
  }
  return opts;
}

function printUsage() {
  console.error(`Usage: npx tsx scripts/cli-session.ts [options]

Options:
  --batch                  Mode non-interactif
  --auto                   Mode auto (un LLM joue le rôle de l'utilisateur)
  --persona "..."          Intention de l'utilisateur simulé (mode auto)
  --json                   Sortie JSON (une ligne par step sur stdout)
  --context '{...}'        Contexte utilisateur en JSON
  --social, --energy, --budget, --env   Contexte par champs séparés
  --children-ages "min,max"    Tranche d'âge enfants (ex: "3,10") — implique social=family
  --timing "now"|"YYYY-MM-DD"  Quand faire l'activité (défaut: now)
  --lang fr|en|es          Langue des réponses LLM (défaut: fr)
  --choices "A,B,..."      Choix prédéfinis (mode batch)
  --prompt-file <path>     System prompt alternatif depuis un fichier
  --transcript <path>      Sauvegarder la session complète en JSON
  --max-steps N            Limite de steps (défaut 20)
  -h, --help               Afficher cette aide`);
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------
async function main() {
  const opts = parseArgs(process.argv);

  if (opts.help) {
    printUsage();
    process.exit(0);
  }

  // Construire le contexte
  let context: UserContext;
  if (opts.context) {
    try {
      context = JSON.parse(opts.context as string);
    } catch {
      console.error("Erreur : --context doit être un JSON valide.");
      process.exit(1);
    }
  } else if (opts.social || opts.energy || opts.budget || opts.env) {
    context = {
      social: (opts.social as string) ?? "Seul",
      energy: parseInt((opts.energy as string) ?? "3", 10),
      budget: (opts.budget as string) ?? "Standard",
      environment: (opts.env as string) ?? "Peu importe",
    };
  } else {
    console.error("Erreur : contexte requis. Utilisez --context ou --social/--energy/--budget/--env.");
    printUsage();
    process.exit(1);
  }

  // Ajouter timing si spécifié via --timing (fonctionne avec --context et champs séparés)
  if (opts.timing) {
    context.timing = opts.timing as string;
  }

  // Ajouter la langue si spécifiée via --lang
  if (opts.lang) {
    context.language = opts.lang as string;
  }

  // Ajouter children_ages si spécifié via --children-ages "min,max"
  if (opts["children-ages"]) {
    const parts = (opts["children-ages"] as string).split(",").map(Number);
    if (parts.length === 2 && !isNaN(parts[0]) && !isNaN(parts[1])) {
      context.children_ages = { min: parts[0], max: parts[1] };
    } else {
      console.error("Erreur : --children-ages doit être au format \"min,max\" (ex: \"3,10\").");
      process.exit(1);
    }
  }

  // System prompt
  let systemPrompt: string | undefined;
  if (opts["prompt-file"]) {
    try {
      systemPrompt = readFileSync(opts["prompt-file"] as string, "utf-8");
    } catch (e: any) {
      console.error(`Erreur lecture prompt-file : ${e.message}`);
      process.exit(1);
    }
  }

  // Choix provider
  const jsonMode = Boolean(opts.json);
  let choiceProvider: ChoiceProvider;
  if (opts.auto) {
    const persona = (opts.persona as string) ?? "Je cherche une activité sympa";
    choiceProvider = autoProvider(persona);
  } else if (opts.batch) {
    const choices = opts.choices
      ? (opts.choices as string).split(",").map((c) => c.trim() as FunnelChoice)
      : [];
    choiceProvider = batchProvider(choices);
  } else {
    choiceProvider = interactiveProvider();
  }

  const maxSteps = opts["max-steps"] ? parseInt(opts["max-steps"] as string, 10) : 20;

  if (!jsonMode) {
    const mode = opts.auto ? "auto" : opts.batch ? "batch" : "interactif";
    console.error(`\n🦉 Mogogo CLI — ${mode}`);
    console.error(`   Fast model: ${LLM_MODEL} @ ${LLM_API_URL}`);
    if (hasBigModel) {
      console.error(`   Big model:  ${LLM_FINAL_MODEL} @ ${LLM_FINAL_API_URL}`);
    }
    console.error(`   Contexte: ${JSON.stringify(context)}`);
    if (opts.lang) console.error(`   Langue: ${opts.lang}`);
    if (opts.auto) console.error(`   Persona: ${opts.persona ?? "Je cherche une activité sympa"}`);
    if (systemPrompt) console.error(`   Prompt file: ${opts["prompt-file"]}`);
    console.error("");
  }

  try {
    const result = await runSession(context, choiceProvider, {
      systemPrompt,
      maxSteps,
      jsonMode,
    });

    if (!jsonMode) {
      console.error(`\n── Session terminée ──`);
      console.error(`   Steps: ${result.steps.length}`);
      console.error(`   Durée totale: ${result.totalDurationMs}ms`);
      console.error(`   Pivot count: ${result.pivotCount}`);
      if (result.finalResponse?.recommandation_finale) {
        console.error(
          `   Résultat: ${result.finalResponse.recommandation_finale.titre}`,
        );
      }
    }

    // Transcript
    if (opts.transcript) {
      writeFileSync(
        opts.transcript as string,
        JSON.stringify(result, null, 2),
        "utf-8",
      );
      if (!jsonMode) {
        console.error(`   Transcript sauvegardé: ${opts.transcript}`);
      }
    }
  } catch (e: any) {
    console.error(`\n❌ Erreur : ${e.message}`);
    process.exit(1);
  }
}

main();
