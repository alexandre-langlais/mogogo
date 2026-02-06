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
type ActionType = "maps" | "web" | "steam" | "app_store" | "play_store" | "youtube" | "streaming" | "spotify";
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
  };
  metadata: { pivot_count: number; current_branch: string };
}

interface UserContext {
  social: string;
  energy: number;
  budget: string;
  environment: string;
  location?: { latitude: number; longitude: number };
}

type FunnelChoice = "A" | "B" | "neither" | "any";

interface HistoryEntry {
  response: LLMResponse;
  choice?: FunnelChoice;
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
// SYSTEM_PROMPT (copie exacte de supabase/functions/llm-gateway/index.ts)
// ---------------------------------------------------------------------------
const DEFAULT_SYSTEM_PROMPT = `Tu es Mogogo, un hibou magicien bienveillant qui aide à trouver LA bonne activité. Réponds TOUJOURS en JSON strict :
{
  "statut": "en_cours"|"finalisé",
  "phase": "questionnement"|"pivot"|"breakout"|"resultat",
  "mogogo_message": "1 phrase courte du hibou (max 100 chars)",
  "question": "Question courte (max 80 chars)",
  "options": {"A":"Label court","B":"Label court"},
  "recommandation_finale": {
    "titre": "Nom de l'activité",
    "explication": "2-3 phrases max",
    "actions": [{"type":"maps|web|steam|app_store|play_store|youtube|streaming|spotify","label":"Texte du bouton","query":"requête de recherche"}]
  },
  "metadata": {"pivot_count":0,"current_branch":"..."}
}

Règles :
- PREMIÈRE question OBLIGATOIRE : 2 catégories LARGES couvrant TOUS les domaines possibles. Chaque option DOIT lister 3-4 exemples concrets entre parenthèses.
  Exemples de bonnes Q1 :
  * Seul/Intérieur : "Écran (film, série, jeu vidéo, musique)" vs "Hors écran (lecture, yoga, cuisine, dessin)"
  * Amis/Extérieur : "Sortie (resto, bar, concert, escape)" vs "Sport (rando, vélo, escalade, foot)"
  * Couple/Extérieur : "Gastronomie (resto, bar à vin, pique-nique)" vs "Culture & nature (musée, balade, concert)"
  Adapte au contexte (énergie, social, budget, environnement).
- Converge vite : 3-5 questions max avant de finaliser. Chaque question affine vers une activité CONCRÈTE et SPÉCIFIQUE (un titre, un lieu, un nom).
- IMPORTANT : chaque Q doit sous-diviser TOUTES les sous-catégories de l'option choisie. Ex: si Q1="Écran (film, série, jeu, musique)" est choisi, Q2 DOIT séparer "Visuel (film, série, jeu)" vs "Audio (musique, podcast)" — ne jamais oublier une sous-catégorie.
- Options A/B courtes (max 50 chars), contrastées, concrètes — inclure des exemples entre parenthèses
- "neither" → pivot latéral (incrémente pivot_count)
- pivot_count >= 3 → breakout (Top 3)
- En "finalisé" : titre = nom précis (titre de jeu, nom de resto, film exact...), explication = 2-3 phrases, et 1-3 actions pertinentes :
  * Lieu physique → "maps" (restaurant, parc, salle...)
  * Jeu PC → "steam" + "youtube" (trailer)
  * Jeu mobile → "app_store" + "play_store"
  * Film/série → "streaming" + "youtube" (bande-annonce)
  * Musique → "spotify"
  * Cours/tuto → "youtube" + "web"
  * Autre → "web"
- Sois bref partout. Pas de texte hors JSON.`;

// ---------------------------------------------------------------------------
// Configuration LLM
// ---------------------------------------------------------------------------
const LLM_API_URL = process.env.LLM_API_URL ?? "http://localhost:11434/v1";
const LLM_MODEL = process.env.LLM_MODEL ?? "gpt-oss:120b-cloud";
const LLM_API_KEY = process.env.LLM_API_KEY ?? "";
const LLM_TEMPERATURE = parseFloat(process.env.LLM_TEMPERATURE ?? "0.8");
const LLM_TIMEOUT_MS = 30_000;

// ---------------------------------------------------------------------------
// Validation (copie de src/services/llm.ts)
// ---------------------------------------------------------------------------
function validateLLMResponse(data: unknown): LLMResponse {
  if (!data || typeof data !== "object") {
    throw new Error("Réponse LLM invalide : objet attendu");
  }
  const d = data as Record<string, unknown>;

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
  if (typeof d.mogogo_message !== "string") {
    throw new Error("Réponse LLM invalide : mogogo_message manquant");
  }
  if (d.statut === "en_cours" && !d.question) {
    throw new Error(
      "Réponse LLM invalide : question manquante en phase en_cours",
    );
  }
  if (d.statut === "finalisé" && !d.recommandation_finale) {
    throw new Error(
      "Réponse LLM invalide : recommandation_finale manquante en phase finalisé",
    );
  }
  // Normaliser : garantir que actions existe toujours dans recommandation_finale
  if (d.recommandation_finale && typeof d.recommandation_finale === "object") {
    const rec = d.recommandation_finale as Record<string, unknown>;
    if (!Array.isArray(rec.actions)) {
      rec.actions = [];
      if (rec.google_maps_query && typeof rec.google_maps_query === "string") {
        rec.actions = [{ type: "maps", label: "Voir sur Maps", query: rec.google_maps_query }];
      }
    }
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
): Promise<{ response: LLMResponse; latencyMs: number }> {
  const messages: Array<{ role: string; content: string }> = [
    { role: "system", content: systemPrompt ?? DEFAULT_SYSTEM_PROMPT },
  ];

  messages.push({
    role: "user",
    content: `Contexte utilisateur : ${JSON.stringify(context)}`,
  });

  for (const entry of history) {
    messages.push({
      role: "assistant",
      content: JSON.stringify(entry.response),
    });
    if (entry.choice) {
      messages.push({ role: "user", content: `Choix : ${entry.choice}` });
    }
  }

  if (choice) {
    messages.push({ role: "user", content: `Choix : ${choice}` });
  }

  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), LLM_TIMEOUT_MS);

  const start = Date.now();
  try {
    const res = await fetch(`${LLM_API_URL}/chat/completions`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        ...(LLM_API_KEY ? { Authorization: `Bearer ${LLM_API_KEY}` } : {}),
      },
      body: JSON.stringify({
        model: LLM_MODEL,
        messages,
        temperature: LLM_TEMPERATURE,
        max_tokens: 800,
        response_format: { type: "json_object" },
      }),
      signal: controller.signal,
    });

    if (!res.ok) {
      const errorText = await res.text();
      throw new Error(`LLM API ${res.status}: ${errorText.slice(0, 200)}`);
    }

    const data = await res.json();
    const content = data.choices?.[0]?.message?.content;
    if (!content) throw new Error("Réponse LLM vide");

    const parsed = JSON.parse(content);
    const response = validateLLMResponse(parsed);
    return { response, latencyMs: Date.now() - start };
  } finally {
    clearTimeout(timeoutId);
  }
}

// ---------------------------------------------------------------------------
// Affichage
// ---------------------------------------------------------------------------
function printStep(
  step: number,
  response: LLMResponse,
  latencyMs: number,
  choice?: FunnelChoice,
  jsonMode = false,
) {
  if (jsonMode) {
    const obj: SessionStep = { step, response, latencyMs, ...(choice !== undefined ? { choice } : {}) };
    process.stdout.write(JSON.stringify(obj) + "\n");
    return;
  }

  const phaseTag = `[${response.phase}]`.padEnd(18);
  console.error(`\n── Step ${step} ${phaseTag} (${latencyMs}ms) ──`);
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
      app_store: "🍎", play_store: "📱", streaming: "🎬", spotify: "🎵",
    };
    if (rec.actions?.length) {
      for (const a of rec.actions) {
        console.error(`   ${ACTION_ICONS[a.type] ?? "🔗"} [${a.type}] ${a.label} → ${a.query}`);
      }
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
  return (_response: LLMResponse) =>
    new Promise<FunnelChoice>((resolve) => {
      rl.question(
        "\nChoix (A / B / neither / any) : ",
        (answer: string) => {
          const cleaned = answer.trim().toLowerCase();
          if (["a", "b", "neither", "any"].includes(cleaned)) {
            resolve(cleaned === "a" ? "A" : cleaned === "b" ? "B" : (cleaned as FunnelChoice));
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

    const res = await fetch(`${LLM_API_URL}/chat/completions`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        ...(LLM_API_KEY ? { Authorization: `Bearer ${LLM_API_KEY}` } : {}),
      },
      body: JSON.stringify({
        model: LLM_MODEL,
        messages: [{ role: "user", content: prompt }],
        temperature: 0.3,
        max_tokens: 500,
      }),
    });

    if (!res.ok) {
      console.error(`⚠️  Auto-provider LLM error ${res.status}, fallback → A`);
      return "A";
    }

    const data = await res.json();
    const msg = data.choices?.[0]?.message;
    // Le contenu peut être dans content (modèle classique) ou reasoning (modèle raisonnement)
    const content = (msg?.content ?? "").trim();
    const reasoning = (msg?.reasoning ?? "").trim();
    const raw = content || reasoning;

    return parseAutoChoice(raw);
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

  // Appel initial (pas de choix)
  const initial = await callLLM(context, history, undefined, options.systemPrompt);
  steps.push({ step: 1, response: initial.response, latencyMs: initial.latencyMs });
  printStep(1, initial.response, initial.latencyMs, undefined, options.jsonMode);

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
    history.push({ response: currentResponse, choice });

    const result = await callLLM(context, history, undefined, options.systemPrompt);
    steps.push({ step: i, response: result.response, choice, latencyMs: result.latencyMs });
    printStep(i, result.response, result.latencyMs, choice, options.jsonMode);

    currentResponse = result.response;

    if (currentResponse.statut === "finalisé") {
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
        "--social", "--energy", "--budget", "--env", "--persona"].includes(arg)
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
    console.error(`   Model: ${LLM_MODEL} @ ${LLM_API_URL}`);
    console.error(`   Contexte: ${JSON.stringify(context)}`);
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
