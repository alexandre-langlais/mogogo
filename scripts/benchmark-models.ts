#!/usr/bin/env npx tsx
/**
 * Benchmark de modèles LLM pour Mogogo.
 *
 * Teste la vitesse et la cohérence des réponses JSON de chaque modèle
 * sur 6 scénarios : premier appel, step intermédiaire, neither/pivot,
 * finalisation, reroll et refine.
 *
 * Usage :
 *   npx tsx scripts/benchmark-models.ts gpt-oss:120b-cloud gemini-3-flash-preview:cloud
 *   npx tsx scripts/benchmark-models.ts --rounds 3 gpt-oss:120b-cloud
 *   npx tsx scripts/benchmark-models.ts --lang en --rounds 1 gpt-oss:120b-cloud
 *   npx tsx scripts/benchmark-models.ts --json --rounds 1 gpt-oss:120b-cloud
 *
 * Options :
 *   --rounds N        Nombre de rounds par scénario (défaut: 1, pour moyenner les temps)
 *   --api-url URL     URL de l'API (défaut: depuis .env.prod ou .env.cli)
 *   --api-key KEY     Clé API (défaut: depuis .env.prod ou .env.cli)
 *   --timeout MS      Timeout par requête en ms (défaut: 60000)
 *   --lang fr|en|es   Langue des réponses LLM (défaut: fr)
 *   --json            Sortie JSON sur stdout
 */

import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { createProvider } from "./lib/llm-providers.js";
import { getDrillDownSystemPrompt, LANGUAGE_INSTRUCTIONS, describeContextV3 } from "../supabase/functions/_shared/system-prompts-v3.ts";

// ---------------------------------------------------------------------------
// Charger .env.prod puis .env.cli (premier trouvé gagne)
// ---------------------------------------------------------------------------
for (const envFile of [".env.prod", ".env.cli"]) {
  try {
    const envPath = resolve(import.meta.dirname ?? ".", `../${envFile}`);
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
    // fichier absent
  }
}

// ---------------------------------------------------------------------------
// Parse des arguments
// ---------------------------------------------------------------------------
const args = process.argv.slice(2);
const models: string[] = [];
let rounds = 1;
let apiUrl = process.env.LLM_API_URL ?? "https://ollama.com/v1";
let apiKey = process.env.LLM_API_KEY ?? "";
let timeout = 60000;
let jsonOutput = false;
let lang = "fr";

for (let i = 0; i < args.length; i++) {
  if (args[i] === "--rounds" && args[i + 1]) { rounds = parseInt(args[++i], 10); continue; }
  if (args[i] === "--api-url" && args[i + 1]) { apiUrl = args[++i]; continue; }
  if (args[i] === "--api-key" && args[i + 1]) { apiKey = args[++i]; continue; }
  if (args[i] === "--timeout" && args[i + 1]) { timeout = parseInt(args[++i], 10); continue; }
  if (args[i] === "--lang" && args[i + 1]) { lang = args[++i]; continue; }
  if (args[i] === "--json") { jsonOutput = true; continue; }
  if (args[i] === "--help" || args[i] === "-h") {
    console.log(`Usage: npx tsx scripts/benchmark-models.ts [options] model1 model2 ...

Options:
  --rounds N      Rounds par scénario (défaut: 1)
  --api-url URL   URL de l'API LLM
  --api-key KEY   Clé API
  --timeout MS    Timeout par requête (défaut: 60000)
  --lang fr|en|es Langue des réponses (défaut: fr)
  --json          Sortie JSON
  -h, --help      Afficher cette aide`);
    process.exit(0);
  }
  if (!args[i].startsWith("--")) models.push(args[i]);
}

if (models.length === 0) {
  console.error("Erreur : spécifie au moins un modèle à tester.");
  console.error("Usage : npx tsx scripts/benchmark-models.ts model1 model2 ...");
  process.exit(1);
}


// ---------------------------------------------------------------------------
// Sanitisation (alignée avec cli-session.ts)
// ---------------------------------------------------------------------------
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

// ---------------------------------------------------------------------------
// Réparation JSON tronqué (copie de l'Edge Function)
// ---------------------------------------------------------------------------
function extractFirstJSON(raw: string): string {
  const start = raw.indexOf("{");
  if (start === -1) return raw;
  let depth = 0;
  let inString = false;
  let escape = false;
  for (let i = start; i < raw.length; i++) {
    const ch = raw[i];
    if (escape) { escape = false; continue; }
    if (ch === "\\") { escape = true; continue; }
    if (ch === '"') { inString = !inString; continue; }
    if (inString) continue;
    if (ch === "{") depth++;
    else if (ch === "}") { depth--; if (depth === 0) return raw.substring(start, i + 1); }
  }
  return raw.substring(start);
}

function tryRepairJSON(raw: string): unknown {
  try { return JSON.parse(raw); } catch { /* continue */ }
  let repaired = extractFirstJSON(raw).trim();
  try { return JSON.parse(repaired); } catch { /* continue */ }
  repaired = repaired.replace(/,\s*"[^"]*"\s*:\s*("([^"\\]|\\.)*)?$/, "");
  repaired = repaired.replace(/,\s*"[^"]*"\s*:?\s*$/, "");
  repaired = repaired.replace(/,\s*"[^"]*$/, "");
  const quoteCount = (repaired.match(/(?<!\\)"/g) || []).length;
  if (quoteCount % 2 !== 0) repaired += '"';
  const opens = { "{": 0, "[": 0 };
  const closes: Record<string, keyof typeof opens> = { "}": "{", "]": "[" };
  for (const ch of repaired) {
    if (ch in opens) opens[ch as keyof typeof opens]++;
    if (ch in closes) opens[closes[ch]]--;
  }
  repaired = repaired.replace(/,\s*$/, "");
  for (let i = 0; i < opens["["]; i++) repaired += "]";
  for (let i = 0; i < opens["{"]; i++) repaired += "}";
  return JSON.parse(repaired);
}

// ---------------------------------------------------------------------------
// Validation robuste (alignée avec cli-session.ts validateLLMResponse)
// ---------------------------------------------------------------------------
interface ValidationResult {
  data: Record<string, unknown>;
  errors: string[];
  warnings: string[];
}

function validateAndRepair(raw: Record<string, unknown>): ValidationResult {
  const d = { ...raw } as Record<string, unknown>;
  // Deep-copy nested objects that we might mutate
  if (d.options && typeof d.options === "object") d.options = { ...(d.options as object) };
  if (d.metadata && typeof d.metadata === "object") d.metadata = { ...(d.metadata as object) };
  if (d.recommandation_finale && typeof d.recommandation_finale === "object") {
    d.recommandation_finale = { ...(d.recommandation_finale as object) };
  }

  const errors: string[] = [];
  const warnings: string[] = [];

  // Detect compressed responses (q/A/B instead of full format)
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
    warnings.push("réponse compressée détectée, reconstruction");
  }

  // Check statut
  if (!["en_cours", "finalisé"].includes(d.statut as string)) {
    errors.push(`statut invalide: '${d.statut}'`);
  }

  // Check phase
  if (!["questionnement", "pivot", "breakout", "resultat"].includes(d.phase as string)) {
    errors.push(`phase invalide: '${d.phase}'`);
  }

  // Recover mogogo_message
  if (typeof d.mogogo_message !== "string" || !(d.mogogo_message as string).trim()) {
    if (typeof (d as Record<string, unknown>).message === "string" && ((d as Record<string, unknown>).message as string).trim()) {
      d.mogogo_message = (d as Record<string, unknown>).message;
      warnings.push("mogogo_message récupéré depuis 'message'");
    } else if (typeof d.question === "string" && (d.question as string).trim()) {
      d.mogogo_message = "Hmm, laisse-moi réfléchir...";
      warnings.push("mogogo_message absent, fallback utilisé");
    } else {
      errors.push("mogogo_message manquant");
    }
  }

  // Sanitize
  sanitizeResponse(d);

  // Normalize breakout: breakout array → recommandation_finale
  if (d.phase === "breakout" && !d.recommandation_finale) {
    const breakoutArray = (d as Record<string, unknown>).breakout ?? (d as Record<string, unknown>).breakout_options;
    if (Array.isArray(breakoutArray) && breakoutArray.length > 0) {
      const items = breakoutArray as Array<{ titre?: string; explication?: string; actions?: unknown[] }>;
      d.statut = "finalisé";
      d.recommandation_finale = {
        titre: items.map(b => b.titre ?? "").filter(Boolean).join(" / "),
        explication: items.map(b => b.explication ?? "").filter(Boolean).join(" "),
        actions: items.flatMap(b => Array.isArray(b.actions) ? b.actions : []),
        tags: [],
      };
      warnings.push("breakout normalisé en recommandation_finale");
    }
  }

  // Flip breakout en_cours → finalisé if reco present
  if (d.phase === "breakout" && d.statut === "en_cours" && d.recommandation_finale) {
    d.statut = "finalisé";
    warnings.push("breakout en_cours avec reco → flip finalisé");
  }

  // Flip en_cours → finalisé if no question but reco present
  if (d.statut === "en_cours" && !d.question && d.recommandation_finale) {
    d.statut = "finalisé";
    d.phase = "resultat";
    warnings.push("en_cours sans question mais avec reco → flip finalisé");
  }

  // Check en_cours has question
  if (d.statut === "en_cours" && !d.question) {
    errors.push("question manquante en phase en_cours");
  }

  // Fallback options if missing in en_cours
  if (d.statut === "en_cours" && d.question && (!d.options || typeof d.options !== "object")) {
    d.options = { A: "Option A", B: "Option B" };
    warnings.push("options manquantes, fallback utilisé");
  }

  // Check finalisé has recommandation_finale
  if (d.statut === "finalisé" && !d.recommandation_finale) {
    errors.push("recommandation_finale manquante en phase finalisé");
  }

  // Normalize recommandation_finale fields
  if (d.recommandation_finale && typeof d.recommandation_finale === "object") {
    const rec = d.recommandation_finale as Record<string, unknown>;
    if (!Array.isArray(rec.actions)) {
      rec.actions = [];
      if (rec.google_maps_query && typeof rec.google_maps_query === "string") {
        rec.actions = [{ type: "maps", label: "Voir sur Maps", query: rec.google_maps_query }];
        warnings.push("actions construites depuis google_maps_query");
      }
    }
    if (Array.isArray(rec.actions) && rec.actions.length === 0 && typeof rec.titre === "string" && rec.titre.trim()) {
      rec.actions = [{ type: "web", label: "Rechercher", query: rec.titre }];
      warnings.push("actions vides, fallback web ajouté");
    }
    if (!rec.explication || (typeof rec.explication === "string" && !rec.explication.trim())) {
      rec.explication = rec.titre ?? "Activité recommandée par Mogogo";
      warnings.push("explication manquante, fallback utilisé");
    }
    if (!Array.isArray(rec.tags)) {
      rec.tags = [];
    } else {
      rec.tags = (rec.tags as unknown[]).filter((t: unknown) => typeof t === "string");
    }
    if (!rec.titre) {
      errors.push("recommandation_finale.titre manquant");
    }
  }

  // Guarantee metadata
  if (!d.metadata || typeof d.metadata !== "object") {
    d.metadata = { pivot_count: 0, current_branch: "Racine", depth: 1 };
    warnings.push("metadata manquant, fallback utilisé");
  }

  return { data: d, errors, warnings };
}

// ---------------------------------------------------------------------------
// Scénarios de test
// ---------------------------------------------------------------------------
interface Scenario {
  name: string;
  description: string;
  messages: Array<{ role: string; content: string }>;
  maxTokens: number;
  expectedStatut: "en_cours" | "finalisé";
}

function buildScenarios(lang: string, systemPrompt: string): Scenario[] {
  const systemMessages: Array<{ role: string; content: string }> = [
    { role: "system", content: systemPrompt },
  ];
  if (LANGUAGE_INSTRUCTIONS[lang]) {
    systemMessages.push({ role: "system", content: LANGUAGE_INSTRUCTIONS[lang] });
  }

  // Contextes de test (clés machine → traduits par describeContextV3)
  const ctx1 = describeContextV3({ social: "friends", environment: "env_open_air" }, lang);
  const ctx2 = describeContextV3({ social: "solo", environment: "env_home" }, lang);
  const ctx3 = describeContextV3({ social: "couple", environment: "env_shelter" }, lang);

  // Historique compressé simulé (comme l'Edge Function)
  const step1 = JSON.stringify({ q: "Créer ou consommer ?", A: "Créer (cuisine, DIY, dessin)", B: "Consommer (film, jeu, série)", phase: "questionnement", branch: "Racine", depth: 1 });
  const step2 = JSON.stringify({ q: "Quel type ?", A: "Film/série (comédie, thriller)", B: "Jeu (vidéo, société, puzzle)", phase: "questionnement", branch: "Consommer", depth: 2 });
  const step3 = JSON.stringify({ q: "Quel genre ?", A: "Comédie légère (romcom, feel-good)", B: "Thriller/suspense (policier, psycho)", phase: "questionnement", branch: "Consommer > Film", depth: 3 });
  const stepFinal = JSON.stringify({ phase: "resultat", branch: "Consommer > Film > Comédie", depth: 3 });

  return [
    // 1. Premier appel avec contexte
    {
      name: "1er appel",
      description: "Premier appel avec contexte utilisateur",
      messages: [
        ...systemMessages,
        { role: "user", content: `Contexte utilisateur : ${JSON.stringify(ctx1)}` },
      ],
      maxTokens: 2000,
      expectedStatut: "en_cours",
    },
    // 2. Step intermédiaire
    {
      name: "Step",
      description: "Choix B après une première question (depth 2)",
      messages: [
        ...systemMessages,
        { role: "user", content: `Contexte utilisateur : ${JSON.stringify(ctx2)}` },
        { role: "assistant", content: step1 },
        { role: "user", content: "Choix : B" },
      ],
      maxTokens: 2000,
      expectedStatut: "en_cours",
    },
    // 3. Neither/pivot (depth >= 2)
    {
      name: "Pivot",
      description: "Neither à depth≥2 (rester dans la catégorie parente)",
      messages: [
        ...systemMessages,
        { role: "user", content: `Contexte utilisateur : ${JSON.stringify(ctx1)}` },
        { role: "assistant", content: step1 },
        { role: "user", content: "Choix : B" },
        { role: "assistant", content: step2 },
        { role: "system", content: `DIRECTIVE SYSTÈME : L'utilisateur a rejeté ces deux sous-options PRÉCISES, mais il aime toujours la catégorie parente "Consommer (film, jeu, série)". Tu DOIS rester dans ce thème et proposer deux alternatives RADICALEMENT DIFFÉRENTES au sein de "Consommer (film, jeu, série)". NE CHANGE PAS de catégorie. Profondeur = 2, chemin = "Consommer (film, jeu, série)".` },
        { role: "user", content: "Choix : neither" },
      ],
      maxTokens: 2000,
      expectedStatut: "en_cours",
    },
    // 4. Finalisation
    {
      name: "Final",
      description: "Forcer une recommandation finale après 3 questions",
      messages: [
        ...systemMessages,
        { role: "user", content: `Contexte utilisateur : ${JSON.stringify(ctx3)}` },
        { role: "assistant", content: step1 },
        { role: "user", content: "Choix : B" },
        { role: "assistant", content: step2 },
        { role: "user", content: "Choix : A" },
        { role: "assistant", content: step3 },
        { role: "user", content: "Choix : A" },
        { role: "system", content: `DIRECTIVE SYSTÈME : L'utilisateur veut un résultat MAINTENANT. Tu DOIS répondre avec statut "finalisé", phase "resultat" et une recommandation_finale concrète basée sur les choix déjà faits dans l'historique. Ne pose AUCUNE question supplémentaire.` },
        { role: "user", content: "Choix : finalize" },
      ],
      maxTokens: 3000,
      expectedStatut: "finalisé",
    },
    // 5. Reroll
    {
      name: "Reroll",
      description: "Demander une alternative après une recommandation",
      messages: [
        ...systemMessages,
        { role: "user", content: `Contexte utilisateur : ${JSON.stringify(ctx3)}` },
        { role: "assistant", content: step1 },
        { role: "user", content: "Choix : B" },
        { role: "assistant", content: step2 },
        { role: "user", content: "Choix : A" },
        { role: "assistant", content: stepFinal },
        { role: "system", content: `DIRECTIVE SYSTÈME : L'utilisateur veut une AUTRE suggestion. Tu DOIS répondre avec statut "finalisé", phase "resultat" et une recommandation_finale DIFFÉRENTE de la précédente, mais dans la même thématique/branche. Ne pose AUCUNE question. Propose directement une activité alternative concrète.` },
        { role: "user", content: "Choix : reroll" },
      ],
      maxTokens: 3000,
      expectedStatut: "finalisé",
    },
    // 6. Refine
    {
      name: "Refine",
      description: "Demander un affinage après une recommandation",
      messages: [
        ...systemMessages,
        { role: "user", content: `Contexte utilisateur : ${JSON.stringify(ctx3)}` },
        { role: "assistant", content: step1 },
        { role: "user", content: "Choix : B" },
        { role: "assistant", content: step2 },
        { role: "user", content: "Choix : A" },
        { role: "assistant", content: stepFinal },
        { role: "system", content: `DIRECTIVE SYSTÈME : L'utilisateur veut AFFINER sa recommandation. Tu DOIS poser au minimum 2 questions ciblées sur l'activité recommandée (durée, ambiance, format, lieu précis...) AVANT de finaliser. Réponds avec statut "en_cours", phase "questionnement". NE finalise PAS maintenant.` },
        { role: "user", content: "Choix : refine" },
      ],
      maxTokens: 2000,
      expectedStatut: "en_cours",
    },
  ];
}

// ---------------------------------------------------------------------------
// Appel LLM
// ---------------------------------------------------------------------------
interface CallResult {
  ok: boolean;
  latencyMs: number;
  content: string | null;
  reasoning: string | null;
  parsed: Record<string, unknown> | null;
  errors: string[];
  warnings: string[];
  httpStatus: number;
  finishReason: string | null;
  tokens: { prompt: number; completion: number; total: number } | null;
}

async function callModel(model: string, scenario: Scenario): Promise<CallResult> {
  const provider = createProvider(apiUrl, model, apiKey);
  const start = performance.now();

  try {
    const result = await provider.call({
      model,
      messages: scenario.messages,
      temperature: 0.7,
      maxTokens: scenario.maxTokens,
      timeoutMs: timeout,
    });

    const latencyMs = Math.round(performance.now() - start);
    const content = result.content;
    const tokens = result.usage ? {
      prompt: result.usage.prompt_tokens,
      completion: result.usage.completion_tokens,
      total: result.usage.total_tokens,
    } : null;

    // Parse JSON (avec réparation des réponses tronquées)
    let parsed: Record<string, unknown>;
    try {
      parsed = JSON.parse(content);
    } catch {
      try {
        parsed = tryRepairJSON(content) as Record<string, unknown>;
      } catch {
        return {
          ok: false, latencyMs, content, reasoning: null, parsed: null,
          errors: [`JSON invalide: ${content.slice(0, 150)}...`], warnings: [],
          httpStatus: 200, finishReason: null, tokens,
        };
      }
    }

    // Validation robuste + réparation
    const { data, errors, warnings } = validateAndRepair(parsed);

    // Vérifier le statut attendu
    if (data.statut !== scenario.expectedStatut) {
      errors.push(`statut attendu '${scenario.expectedStatut}', reçu '${data.statut}'`);
    }

    // Vérifications supplémentaires pour en_cours
    if (scenario.expectedStatut === "en_cours") {
      const opts = data.options as Record<string, string> | undefined;
      if (opts?.A && opts.A.length > 60) errors.push(`option A trop longue (${opts.A.length} chars)`);
      if (opts?.B && opts.B.length > 60) errors.push(`option B trop longue (${opts.B.length} chars)`);
      if (typeof data.question === "string" && data.question.length > 100)
        errors.push(`question trop longue (${(data.question as string).length} chars)`);
    }

    // Vérifier la langue (heuristique pour détecter l'anglais quand ce n'est pas attendu)
    if (lang !== "en") {
      const mogogoMsg = data.mogogo_message as string | undefined;
      if (mogogoMsg && /^[A-Z][a-z]+ (the|a|an|is|to|for|you|we|it) /i.test(mogogoMsg)) {
        errors.push("mogogo_message semble en anglais");
      }
    }

    return {
      ok: errors.length === 0, latencyMs, content, reasoning: null, parsed: data,
      errors, warnings, httpStatus: 200, finishReason: null, tokens,
    };
  } catch (err: unknown) {
    const latencyMs = Math.round(performance.now() - start);
    const message = err instanceof Error ? err.message : String(err);
    return {
      ok: false, latencyMs, content: null, reasoning: null, parsed: null,
      errors: [message.includes("abort") ? `Timeout (${timeout}ms)` : message],
      warnings: [], httpStatus: 0, finishReason: null, tokens: null,
    };
  }
}

// ---------------------------------------------------------------------------
// Exécution du benchmark
// ---------------------------------------------------------------------------
interface ModelResult {
  model: string;
  scenarios: Array<{
    scenario: string;
    rounds: CallResult[];
    avgLatencyMs: number;
    successRate: number;
  }>;
  overallAvgLatencyMs: number;
  overallSuccessRate: number;
}

async function runBenchmark(): Promise<ModelResult[]> {
  const results: ModelResult[] = [];

  for (const model of models) {
    const scenarios = buildScenarios(lang, getDrillDownSystemPrompt());
    if (!jsonOutput) console.log(`\n${"═".repeat(60)}`);
    if (!jsonOutput) console.log(`  Modèle : ${model}`);
    if (!jsonOutput) console.log(`${"═".repeat(60)}`);

    const modelResult: ModelResult = {
      model,
      scenarios: [],
      overallAvgLatencyMs: 0,
      overallSuccessRate: 0,
    };

    for (const scenario of scenarios) {
      if (!jsonOutput) console.log(`\n  ▸ ${scenario.name} (${scenario.description})`);

      const roundResults: CallResult[] = [];
      for (let r = 0; r < rounds; r++) {
        if (!jsonOutput && rounds > 1) process.stdout.write(`    Round ${r + 1}/${rounds}... `);
        const result = await callModel(model, scenario);
        roundResults.push(result);

        if (!jsonOutput) {
          const status = result.ok ? "✓" : "✗";
          const latency = `${(result.latencyMs / 1000).toFixed(1)}s`;
          const tokInfo = result.tokens ? `${result.tokens.completion} tok` : "";
          const truncated = result.finishReason === "length" ? ", TRONQUÉ" : "";
          const warnCount = result.warnings.length > 0 ? `, ${result.warnings.length} réparé` : "";
          const info = [tokInfo, truncated, warnCount].filter(Boolean).join("");
          const tokens = info ? ` (${info})` : "";

          if (rounds > 1) {
            console.log(`${status} ${latency}${tokens}`);
          } else {
            console.log(`    ${status} ${latency}${tokens}`);
          }

          if (result.warnings.length > 0) {
            for (const w of result.warnings) {
              console.log(`      🔧 ${w}`);
            }
          }

          if (result.errors.length > 0) {
            for (const err of result.errors) {
              console.log(`      ⚠ ${err}`);
            }
          }

          // Afficher un aperçu de la réponse
          if (result.parsed) {
            const p = result.parsed;
            if (p.statut === "en_cours") {
              console.log(`      → "${p.mogogo_message}"`);
              const opts = p.options as Record<string, string> | undefined;
              console.log(`      → Q: "${p.question}"`);
              if (opts) console.log(`      → A: "${opts.A}" | B: "${opts.B}"`);
            } else if (p.statut === "finalisé") {
              const rec = p.recommandation_finale as Record<string, unknown> | undefined;
              console.log(`      → "${p.mogogo_message}"`);
              if (rec) {
                console.log(`      → Reco: "${rec.titre}"`);
                const actions = rec.actions as Array<{ type: string; label: string; query: string }> | undefined;
                if (actions && actions.length > 0) {
                  const actionList = actions.map(a => `${a.type}: ${a.query}`).join(", ");
                  console.log(`      → Actions: [${actionList}]`);
                }
              }
            }
          }
        }
      }

      const successes = roundResults.filter(r => r.ok).length;
      const avgLatency = roundResults.reduce((s, r) => s + r.latencyMs, 0) / roundResults.length;

      modelResult.scenarios.push({
        scenario: scenario.name,
        rounds: roundResults,
        avgLatencyMs: Math.round(avgLatency),
        successRate: successes / roundResults.length,
      });
    }

    // Moyennes globales
    const allRounds = modelResult.scenarios.flatMap(s => s.rounds);
    modelResult.overallAvgLatencyMs = Math.round(
      allRounds.reduce((s, r) => s + r.latencyMs, 0) / allRounds.length
    );
    modelResult.overallSuccessRate =
      allRounds.filter(r => r.ok).length / allRounds.length;

    results.push(modelResult);
  }

  return results;
}

// ---------------------------------------------------------------------------
// Tableau récapitulatif
// ---------------------------------------------------------------------------
function printSummary(results: ModelResult[], scenarios: Scenario[]) {
  console.log(`\n${"═".repeat(90)}`);
  console.log("  RÉCAPITULATIF");
  console.log(`${"═".repeat(90)}`);

  // Header
  const col1 = 22;
  const colS = 11;
  const header = "Modèle".padEnd(col1)
    + scenarios.map(s => s.name.slice(0, colS - 1).padStart(colS)).join("")
    + "Moyenne".padStart(colS)
    + "Score".padStart(8);
  console.log(`  ${header}`);
  console.log(`  ${"─".repeat(header.length)}`);

  for (const mr of results) {
    const name = mr.model.length > col1 - 2 ? mr.model.slice(0, col1 - 4) + ".." : mr.model;
    let line = name.padEnd(col1);

    for (const sr of mr.scenarios) {
      const t = `${(sr.avgLatencyMs / 1000).toFixed(1)}s`;
      const ok = sr.successRate === 1 ? "✓" : sr.successRate === 0 ? "✗" : `~${Math.round(sr.successRate * 100)}%`;
      line += `${t} ${ok}`.padStart(colS);
    }

    const avgT = `${(mr.overallAvgLatencyMs / 1000).toFixed(1)}s`;
    line += avgT.padStart(colS);

    const score = `${Math.round(mr.overallSuccessRate * 100)}%`;
    line += score.padStart(8);

    console.log(`  ${line}`);
  }

  console.log(`  ${"─".repeat(header.length)}`);

  // Résumé erreurs/réparations par modèle
  for (const mr of results) {
    const allRounds = mr.scenarios.flatMap(s => s.rounds);
    const totalWarnings = allRounds.reduce((s, r) => s + r.warnings.length, 0);
    const totalErrors = allRounds.reduce((s, r) => s + r.errors.length, 0);
    if (totalWarnings > 0 || totalErrors > 0) {
      console.log(`  ${mr.model}: ${totalErrors} erreur(s), ${totalWarnings} réparation(s)`);
    }
  }

  // Recommandation
  const viable = results.filter(r => r.overallSuccessRate === 1);
  if (viable.length > 0) {
    viable.sort((a, b) => a.overallAvgLatencyMs - b.overallAvgLatencyMs);
    console.log(`\n  🏆 Meilleur modèle compatible : ${viable[0].model} (${(viable[0].overallAvgLatencyMs / 1000).toFixed(1)}s avg, 100% valide)`);
    if (viable.length > 1) {
      console.log(`  🥈 Runner-up : ${viable[1].model} (${(viable[1].overallAvgLatencyMs / 1000).toFixed(1)}s avg)`);
    }
  } else {
    console.log("\n  ⚠ Aucun modèle n'a passé tous les tests à 100%.");
    const best = [...results].sort((a, b) => b.overallSuccessRate - a.overallSuccessRate)[0];
    if (best) console.log(`  Le plus proche : ${best.model} (${Math.round(best.overallSuccessRate * 100)}%)`);
  }
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------
async function main() {
  if (!jsonOutput) {
    console.log("╔════════════════════════════════════════════════════════╗");
    console.log("║         Mogogo — Benchmark de modèles LLM            ║");
    console.log("╠════════════════════════════════════════════════════════╣");
    console.log(`║  API     : ${apiUrl.padEnd(42)}║`);
    console.log(`║  Modèles : ${models.join(", ").slice(0, 42).padEnd(42)}║`);
    console.log(`║  Rounds  : ${String(rounds).padEnd(42)}║`);
    console.log(`║  Langue  : ${lang.padEnd(42)}║`);
    console.log(`║  Timeout : ${(timeout / 1000 + "s").padEnd(42)}║`);
    console.log("╚════════════════════════════════════════════════════════╝");
  }

  const results = await runBenchmark();

  if (jsonOutput) {
    console.log(JSON.stringify(results, null, 2));
  } else {
    // Use first model's scenarios for column names in summary
    const scenarios = buildScenarios(lang, getDrillDownSystemPrompt());
    printSummary(results, scenarios);
  }
}

main().catch(err => {
  console.error("Erreur fatale :", err);
  process.exit(1);
});
