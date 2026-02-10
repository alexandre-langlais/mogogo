#!/usr/bin/env npx tsx
/**
 * Benchmark de modèles LLM pour Mogogo.
 *
 * Teste la vitesse et la cohérence des réponses JSON de chaque modèle
 * sur 3 scénarios : premier appel, step intermédiaire, finalisation.
 *
 * Usage :
 *   npx tsx scripts/benchmark-models.ts gpt-oss:120b-cloud gemini-3-flash-preview:cloud gpt-oss:20b-cloud
 *   npx tsx scripts/benchmark-models.ts --rounds 3 gpt-oss:120b-cloud gemini-3-flash-preview:cloud
 *   npx tsx scripts/benchmark-models.ts --api-url https://ollama.com/v1 --api-key YOUR_KEY model1 model2
 *
 * Options :
 *   --rounds N        Nombre de rounds par scénario (défaut: 1, pour moyenner les temps)
 *   --api-url URL     URL de l'API (défaut: depuis .env.prod ou .env.cli)
 *   --api-key KEY     Clé API (défaut: depuis .env.prod ou .env.cli)
 *   --timeout MS      Timeout par requête en ms (défaut: 60000)
 *   --json            Sortie JSON sur stdout
 */

import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { createProvider } from "./lib/llm-providers.js";

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

for (let i = 0; i < args.length; i++) {
  if (args[i] === "--rounds" && args[i + 1]) { rounds = parseInt(args[++i], 10); continue; }
  if (args[i] === "--api-url" && args[i + 1]) { apiUrl = args[++i]; continue; }
  if (args[i] === "--api-key" && args[i + 1]) { apiKey = args[++i]; continue; }
  if (args[i] === "--timeout" && args[i + 1]) { timeout = parseInt(args[++i], 10); continue; }
  if (args[i] === "--json") { jsonOutput = true; continue; }
  if (args[i] === "--help" || args[i] === "-h") {
    console.log(`Usage: npx tsx scripts/benchmark-models.ts [options] model1 model2 ...

Options:
  --rounds N      Rounds par scénario (défaut: 1)
  --api-url URL   URL de l'API LLM
  --api-key KEY   Clé API
  --timeout MS    Timeout par requête (défaut: 60000)
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
// Scénarios de test
// ---------------------------------------------------------------------------
interface Scenario {
  name: string;
  description: string;
  messages: Array<{ role: string; content: string }>;
  maxTokens: number;
  /** Validations sur la réponse parsée */
  validate: (parsed: Record<string, unknown>) => string[];
}

const SYSTEM_PROMPT_SHORT = `Tu es Mogogo, hibou magicien bienveillant. Réponds TOUJOURS en JSON strict :
{"statut":"en_cours|finalisé","phase":"questionnement|pivot|breakout|resultat","mogogo_message":"≤100 chars","question":"≤80 chars","options":{"A":"≤50 chars","B":"≤50 chars"},"recommandation_finale":{"titre":"Nom","explication":"2-3 phrases max","actions":[{"type":"maps|web|steam|app_store|play_store|youtube|streaming|spotify","label":"Texte","query":"≤60 chars"}],"tags":["slug"]},"metadata":{"pivot_count":0,"current_branch":"Cat > Sous-cat","depth":1}}
FORMAT : JSON complet et valide uniquement. Rien avant ni après.`;

function validateBase(p: Record<string, unknown>): string[] {
  const errors: string[] = [];
  if (!p.statut) errors.push("champ 'statut' manquant");
  if (!p.phase) errors.push("champ 'phase' manquant");
  if (!p.mogogo_message) errors.push("champ 'mogogo_message' manquant");
  if (typeof p.mogogo_message === "string" && p.mogogo_message.length > 120)
    errors.push(`mogogo_message trop long (${(p.mogogo_message as string).length} chars)`);
  if (!p.metadata) errors.push("champ 'metadata' manquant");
  return errors;
}

function validateEnCours(p: Record<string, unknown>): string[] {
  const errors = validateBase(p);
  if (p.statut !== "en_cours") errors.push(`statut attendu 'en_cours', reçu '${p.statut}'`);
  if (!p.question) errors.push("champ 'question' manquant");
  const opts = p.options as Record<string, string> | undefined;
  if (!opts?.A || !opts?.B) errors.push("options A/B manquantes");
  if (opts?.A && opts.A.length > 60) errors.push(`option A trop longue (${opts.A.length} chars)`);
  if (opts?.B && opts.B.length > 60) errors.push(`option B trop longue (${opts.B.length} chars)`);
  if (typeof p.question === "string" && p.question.length > 100)
    errors.push(`question trop longue (${(p.question as string).length} chars)`);
  return errors;
}

function validateFinalise(p: Record<string, unknown>): string[] {
  const errors = validateBase(p);
  if (p.statut !== "finalisé") errors.push(`statut attendu 'finalisé', reçu '${p.statut}'`);
  const rec = p.recommandation_finale as Record<string, unknown> | undefined;
  if (!rec) {
    errors.push("recommandation_finale manquante");
  } else {
    if (!rec.titre) errors.push("recommandation_finale.titre manquant");
    if (!rec.explication) errors.push("recommandation_finale.explication manquante");
    if (!Array.isArray(rec.actions) || rec.actions.length === 0)
      errors.push("recommandation_finale.actions vide ou manquant");
  }
  return errors;
}

const scenarios: Scenario[] = [
  {
    name: "1er appel",
    description: "Premier appel avec contexte utilisateur (pas d'historique)",
    messages: [
      { role: "system", content: SYSTEM_PROMPT_SHORT },
      { role: "user", content: 'Contexte utilisateur : {"social":"Amis","energy":4,"budget":"Standard","environment":"Extérieur"}' },
    ],
    maxTokens: 2000,
    validate: validateEnCours,
  },
  {
    name: "Step intermédiaire",
    description: "Choix A après une première question (depth 2)",
    messages: [
      { role: "system", content: SYSTEM_PROMPT_SHORT },
      { role: "user", content: 'Contexte utilisateur : {"social":"Seul","energy":3,"budget":"Gratuit","environment":"Intérieur"}' },
      { role: "assistant", content: '{"q":"Créer ou consommer ?","A":"Créer (cuisine, DIY, dessin)","B":"Consommer (film, jeu, série)","phase":"questionnement"}' },
      { role: "user", content: "Choix : B" },
    ],
    maxTokens: 2000,
    validate: validateEnCours,
  },
  {
    name: "Finalisation",
    description: "L'utilisateur demande un résultat final après 3 questions",
    messages: [
      { role: "system", content: SYSTEM_PROMPT_SHORT },
      { role: "user", content: 'Contexte utilisateur : {"social":"Couple","energy":3,"budget":"Standard","environment":"Intérieur"}' },
      { role: "assistant", content: '{"q":"Créer ou consommer ?","A":"Créer (cuisine, DIY, dessin)","B":"Consommer (film, jeu, série)","phase":"questionnement"}' },
      { role: "user", content: "Choix : B" },
      { role: "assistant", content: '{"q":"Quel type ?","A":"Film/série (comédie, thriller, drame)","B":"Jeu (vidéo, société, puzzle)","phase":"questionnement","branch":"Consommer","depth":2}' },
      { role: "user", content: "Choix : A" },
      { role: "assistant", content: '{"q":"Quel genre ?","A":"Comédie légère (romcom, feel-good)","B":"Thriller/suspense (policier, psycho)","phase":"questionnement","branch":"Consommer > Film","depth":3}' },
      { role: "user", content: "Choix : A" },
      { role: "system", content: "DIRECTIVE SYSTÈME : L'utilisateur veut un résultat MAINTENANT. Tu DOIS répondre avec statut \"finalisé\", phase \"resultat\" et une recommandation_finale concrète basée sur les choix déjà faits. Ne pose AUCUNE question supplémentaire." },
      { role: "user", content: "Choix : finalize" },
    ],
    maxTokens: 2000,
    validate: validateFinalise,
  },
];

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
          errors: [`JSON invalide: ${content.slice(0, 150)}...`],
          httpStatus: 200, finishReason: null, tokens,
        };
      }
    }

    // Validation
    const validationErrors = scenario.validate(parsed);

    // Vérifier la langue (doit être en français)
    const mogogoMsg = parsed.mogogo_message as string | undefined;
    if (mogogoMsg && /^[A-Z][a-z]+ (the|a|an|is|to|for|you|we|it) /i.test(mogogoMsg)) {
      validationErrors.push("mogogo_message semble en anglais");
    }

    return {
      ok: validationErrors.length === 0, latencyMs, content, reasoning: null, parsed,
      errors: validationErrors, httpStatus: 200, finishReason: null, tokens,
    };
  } catch (err: unknown) {
    const latencyMs = Math.round(performance.now() - start);
    const message = err instanceof Error ? err.message : String(err);
    return {
      ok: false, latencyMs, content: null, reasoning: null, parsed: null,
      errors: [message.includes("abort") ? `Timeout (${timeout}ms)` : message],
      httpStatus: 0, finishReason: null, tokens: null,
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
          const tokens = tokInfo || truncated ? ` (${tokInfo}${truncated})` : "";

          if (rounds > 1) {
            console.log(`${status} ${latency}${tokens}`);
          } else {
            console.log(`    ${status} ${latency}${tokens}`);
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
              if (rec) console.log(`      → Reco: "${rec.titre}"`);
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
function printSummary(results: ModelResult[]) {
  console.log(`\n${"═".repeat(76)}`);
  console.log("  RÉCAPITULATIF");
  console.log(`${"═".repeat(76)}`);

  // Header
  const col1 = 30;
  const colS = 14;
  const header = "Modèle".padEnd(col1)
    + scenarios.map(s => s.name.padStart(colS)).join("")
    + "  Moyenne".padStart(colS)
    + "  Score".padStart(8);
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
    console.log(`║  Timeout : ${(timeout / 1000 + "s").padEnd(42)}║`);
    console.log("╚════════════════════════════════════════════════════════╝");
  }

  const results = await runBenchmark();

  if (jsonOutput) {
    console.log(JSON.stringify(results, null, 2));
  } else {
    printSummary(results);
  }
}

main().catch(err => {
  console.error("Erreur fatale :", err);
  process.exit(1);
});
