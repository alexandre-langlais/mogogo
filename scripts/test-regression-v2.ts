#!/usr/bin/env npx tsx
/**
 * Test de non-régression Mogogo v2 — TypeScript, exécution parallèle, vérifications renforcées.
 *
 * Usage :
 *   npx tsx scripts/test-regression-v2.ts
 *   npx tsx scripts/test-regression-v2.ts --concurrency 3
 *   npx tsx scripts/test-regression-v2.ts --filter "solo,friends"
 *   npx tsx scripts/test-regression-v2.ts --lot 1,2
 */

import { execFile } from "node:child_process";
import { mkdirSync, writeFileSync, readFileSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";

// ---------------------------------------------------------------------------
// Config
// ---------------------------------------------------------------------------
const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const PROJECT_DIR = resolve(__dirname, "..");
const SCRIPTS_DIR = resolve(PROJECT_DIR, "scripts");
const CLI_SCRIPT = resolve(SCRIPTS_DIR, "cli-session.ts");
const RESULTS_DIR = resolve(PROJECT_DIR, "test-results");
const TIMESTAMP = new Date().toISOString().replace(/[:.]/g, "-").slice(0, 19);
const RUN_DIR = resolve(RESULTS_DIR, `run_${TIMESTAMP}`);

const DEFAULT_CONCURRENCY = 2;
const TEST_TIMEOUT_MS = 120_000;
const MAX_STEPS = 15;

// ---------------------------------------------------------------------------
// Types
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
    actions: Action[];
    tags?: string[];
  };
  metadata: { pivot_count: number; current_branch: string; depth?: number };
}

interface SessionStep {
  step: number;
  response: LLMResponse;
  choice?: string;
  latencyMs: number;
}

interface SessionResult {
  steps: SessionStep[];
  totalDurationMs: number;
  finalResponse?: LLMResponse;
  pivotCount: number;
}

interface TestCheck {
  code: string;
  message: string;
  severity: "error" | "warning";
}

interface TestResult {
  id: string;
  description: string;
  lot: string;
  status: "pass" | "fail" | "crash";
  checks: TestCheck[];
  steps?: number;
  durationMs?: number;
  titre?: string;
  error?: string;
}

interface TestDefinition {
  id: string;
  description: string;
  lot: string;
  args: string[];
}

// ---------------------------------------------------------------------------
// Limites de longueur (doivent matcher la sanitisation dans llm.ts et l'Edge Function)
// ---------------------------------------------------------------------------
const LIMITS = {
  mogogo_message: 120,
  question: 100,
  option: 60,
  action_query: 60,
  explication: 200,
};

// ---------------------------------------------------------------------------
// Vérifications
// ---------------------------------------------------------------------------
function checkSession(result: SessionResult): TestCheck[] {
  const checks: TestCheck[] = [];

  // 1. Finalisation
  if (!result.finalResponse) {
    checks.push({ code: "NO_FINAL", message: "Session non finalisée", severity: "error" });
    return checks; // pas la peine de vérifier le reste
  }

  if (result.finalResponse.statut !== "finalisé") {
    checks.push({ code: "BAD_STATUT", message: `Statut final: ${result.finalResponse.statut}`, severity: "error" });
  }

  const rec = result.finalResponse.recommandation_finale;
  if (!rec) {
    checks.push({ code: "NO_RECO", message: "recommandation_finale manquante", severity: "error" });
    return checks;
  }

  // 2. Recommandation finale
  if (!rec.titre || !rec.titre.trim()) {
    checks.push({ code: "NO_TITRE", message: "titre vide", severity: "error" });
  }
  if (!rec.explication || !rec.explication.trim()) {
    checks.push({ code: "NO_EXPLICATION", message: "explication vide", severity: "error" });
  }
  if (!rec.actions || rec.actions.length === 0) {
    checks.push({ code: "NO_ACTIONS", message: "Aucune action", severity: "error" });
  }
  if (rec.explication && rec.explication.length > LIMITS.explication + 20) {
    checks.push({ code: "LONG_EXPLICATION", message: `explication ${rec.explication.length} chars (max ${LIMITS.explication})`, severity: "warning" });
  }

  // 3. Actions valides
  const validTypes = new Set(["maps", "web", "steam", "play_store", "youtube", "streaming", "spotify"]);
  for (const a of rec.actions ?? []) {
    if (!a.type || !validTypes.has(a.type)) {
      checks.push({ code: "BAD_ACTION_TYPE", message: `Action type invalide: ${a.type}`, severity: "error" });
    }
    if (!a.label || !a.label.trim()) {
      checks.push({ code: "BAD_ACTION_LABEL", message: "Action label vide", severity: "error" });
    }
    if (!a.query || !a.query.trim()) {
      checks.push({ code: "BAD_ACTION_QUERY", message: "Action query vide", severity: "error" });
    }
    if (a.query && a.query.length > LIMITS.action_query + 10) {
      checks.push({ code: "LONG_ACTION_QUERY", message: `Action query ${a.query.length} chars`, severity: "warning" });
    }
    // Vérifier pas d'opérateurs de recherche dans les query
    if (a.query && /site:|intitle:|inurl:|filetype:/i.test(a.query)) {
      checks.push({ code: "SEARCH_OP_QUERY", message: `Opérateur de recherche dans query: ${a.query}`, severity: "error" });
    }
  }

  // 4. Tags
  const validTags = new Set(["story_screen", "calm_escape", "music_crea", "move_sport", "nature_adventure", "food_drink", "culture_knowledge", "social_fun"]);
  if (!rec.tags || rec.tags.length === 0) {
    checks.push({ code: "NO_TAGS", message: "Aucun tag", severity: "warning" });
  }
  for (const tag of rec.tags ?? []) {
    if (!validTags.has(tag)) {
      checks.push({ code: "BAD_TAG", message: `Tag inconnu: ${tag}`, severity: "warning" });
    }
  }

  // 5. Vérifier chaque step
  for (const s of result.steps) {
    const r = s.response;
    if (!r || !r.statut) {
      checks.push({ code: `BAD_STEP_${s.step}`, message: `Step ${s.step}: réponse invalide`, severity: "error" });
      continue;
    }

    // mogogo_message toujours présent
    if (!r.mogogo_message || !r.mogogo_message.trim()) {
      checks.push({ code: `NO_MSG_${s.step}`, message: `Step ${s.step}: mogogo_message vide`, severity: "error" });
    }

    // Longueurs
    if (r.mogogo_message && r.mogogo_message.length > LIMITS.mogogo_message + 5) {
      checks.push({ code: `LONG_MSG_${s.step}`, message: `Step ${s.step}: mogogo_message ${r.mogogo_message.length} chars (max ${LIMITS.mogogo_message})`, severity: "warning" });
    }
    if (r.question && r.question.length > LIMITS.question + 5) {
      checks.push({ code: `LONG_Q_${s.step}`, message: `Step ${s.step}: question ${r.question.length} chars (max ${LIMITS.question})`, severity: "warning" });
    }

    // Options en_cours
    if (r.statut === "en_cours" && r.options) {
      if (!r.options.A?.trim()) {
        checks.push({ code: `EMPTY_A_${s.step}`, message: `Step ${s.step}: Option A vide`, severity: "error" });
      }
      if (!r.options.B?.trim()) {
        checks.push({ code: `EMPTY_B_${s.step}`, message: `Step ${s.step}: Option B vide`, severity: "error" });
      }
      if (r.options.A && r.options.A.length > LIMITS.option + 5) {
        checks.push({ code: `LONG_A_${s.step}`, message: `Step ${s.step}: Option A ${r.options.A.length} chars (max ${LIMITS.option})`, severity: "warning" });
      }
      if (r.options.B && r.options.B.length > LIMITS.option + 5) {
        checks.push({ code: `LONG_B_${s.step}`, message: `Step ${s.step}: Option B ${r.options.B.length} chars (max ${LIMITS.option})`, severity: "warning" });
      }
    }

    // Markdown dans les textes
    const hasMd = (t?: string) => t && /\*\*/.test(t);
    if (hasMd(r.mogogo_message)) {
      checks.push({ code: `MD_MSG_${s.step}`, message: `Step ${s.step}: markdown dans mogogo_message`, severity: "error" });
    }
    if (hasMd(r.question)) {
      checks.push({ code: `MD_Q_${s.step}`, message: `Step ${s.step}: markdown dans question`, severity: "error" });
    }
    if (hasMd(r.options?.A)) {
      checks.push({ code: `MD_A_${s.step}`, message: `Step ${s.step}: markdown dans option A`, severity: "error" });
    }
    if (hasMd(r.options?.B)) {
      checks.push({ code: `MD_B_${s.step}`, message: `Step ${s.step}: markdown dans option B`, severity: "error" });
    }

    // Metadata
    if (!r.metadata || typeof r.metadata !== "object") {
      checks.push({ code: `NO_META_${s.step}`, message: `Step ${s.step}: metadata manquante`, severity: "warning" });
    }
  }

  return checks;
}

// ---------------------------------------------------------------------------
// Exécution d'un test
// ---------------------------------------------------------------------------
function runTest(test: TestDefinition): Promise<TestResult> {
  return new Promise((resolve) => {
    const transcriptPath = `${RUN_DIR}/${test.id}.json`;
    const logPath = `${RUN_DIR}/${test.id}.log`;

    const args = [
      CLI_SCRIPT,
      ...test.args,
      "--json",
      "--transcript", transcriptPath,
      "--max-steps", String(MAX_STEPS),
    ];

    const proc = execFile("npx", ["tsx", ...args], {
      timeout: TEST_TIMEOUT_MS,
      maxBuffer: 10 * 1024 * 1024,
      env: process.env,
    }, (error, _stdout, stderr) => {
      // Save log
      try { writeFileSync(logPath, stderr ?? ""); } catch {}

      if (error) {
        resolve({
          id: test.id,
          description: test.description,
          lot: test.lot,
          status: "crash",
          checks: [],
          error: error.message?.slice(0, 200),
        });
        return;
      }

      // Parse transcript
      let result: SessionResult;
      try {
        const raw = JSON.parse(readFileSync(transcriptPath, "utf-8"));
        result = raw as SessionResult;
      } catch (e: any) {
        resolve({
          id: test.id,
          description: test.description,
          lot: test.lot,
          status: "crash",
          checks: [],
          error: `Transcript parse error: ${e.message}`,
        });
        return;
      }

      const checks = checkSession(result);
      const hasErrors = checks.some(c => c.severity === "error");

      resolve({
        id: test.id,
        description: test.description,
        lot: test.lot,
        status: hasErrors ? "fail" : "pass",
        checks,
        steps: result.steps.length,
        durationMs: result.totalDurationMs,
        titre: result.finalResponse?.recommandation_finale?.titre,
      });
    });
  });
}

// ---------------------------------------------------------------------------
// Pool de concurrence
// ---------------------------------------------------------------------------
async function runPool<T, R>(items: T[], concurrency: number, fn: (item: T) => Promise<R>): Promise<R[]> {
  const results: R[] = [];
  let index = 0;

  async function worker() {
    while (index < items.length) {
      const i = index++;
      results[i] = await fn(items[i]);
    }
  }

  const workers = Array.from({ length: Math.min(concurrency, items.length) }, () => worker());
  await Promise.all(workers);
  return results;
}

// ---------------------------------------------------------------------------
// Définition des tests
// ---------------------------------------------------------------------------
const TESTS: TestDefinition[] = [
  // LOT 1 : Contextes sociaux de base
  { id: "01_solo_standard", description: "Seul, intérieur", lot: "1_social",
    args: ["--auto", "--persona", "Je veux me détendre ce soir", "--social", "solo", "--env", "env_shelter"] },
  { id: "02_friends_outdoor", description: "Amis, extérieur", lot: "1_social",
    args: ["--auto", "--persona", "On veut faire un truc fun entre potes dehors", "--social", "friends", "--env", "env_open_air"] },
  { id: "03_couple_luxury", description: "Couple, intérieur", lot: "1_social",
    args: ["--auto", "--persona", "Soirée romantique en amoureux", "--social", "couple", "--env", "env_shelter"] },
  { id: "04_family_free", description: "Famille, extérieur", lot: "1_social",
    args: ["--auto", "--persona", "Journée en famille sans dépenser", "--social", "family", "--env", "env_open_air"] },
  { id: "05_solo_budget", description: "Seul, intérieur", lot: "1_social",
    args: ["--auto", "--persona", "Je suis crevé et je veux un truc pas cher", "--social", "solo", "--env", "env_shelter"] },

  // LOT 2 : Enfants
  { id: "06_kids_toddler", description: "Famille, tout-petits 1-3 ans", lot: "2_kids",
    args: ["--auto", "--persona", "Activité avec mon bébé de 2 ans", "--social", "family", "--env", "env_shelter", "--children-ages", "1,3"] },
  { id: "07_kids_school", description: "Famille, primaire 6-10 ans", lot: "2_kids",
    args: ["--auto", "--persona", "Activité éducative et amusante", "--social", "family", "--env", "env_home", "--children-ages", "6,10"] },
  { id: "08_kids_teen", description: "Famille, ados 13-17 ans", lot: "2_kids",
    args: ["--auto", "--persona", "Activité fun avec des ados", "--social", "family", "--env", "env_open_air", "--children-ages", "13,17"] },
  { id: "09_kids_wide_range", description: "Famille, large range 2-12 ans", lot: "2_kids",
    args: ["--auto", "--persona", "Sortie familiale avec enfants d'âges variés", "--social", "family", "--env", "env_home", "--children-ages", "2,12"] },

  // LOT 3 : Saisons (la persona guide le LLM)
  { id: "10_timing_summer", description: "Été, couple, extérieur", lot: "3_timing",
    args: ["--auto", "--persona", "Activité estivale en amoureux", "--social", "couple", "--env", "env_open_air"] },
  { id: "11_timing_winter", description: "Hiver, famille", lot: "3_timing",
    args: ["--auto", "--persona", "Activité d'hiver en famille", "--social", "family", "--env", "env_home"] },
  { id: "12_timing_spring", description: "Printemps, seul, extérieur", lot: "3_timing",
    args: ["--auto", "--persona", "Profiter du printemps seul", "--social", "solo", "--env", "env_open_air"] },

  // LOT 4 : Langues
  { id: "13_lang_en_solo", description: "Anglais, seul, intérieur", lot: "4_lang",
    args: ["--auto", "--persona", "I want to relax at home tonight", "--social", "solo", "--env", "env_shelter", "--lang", "en"] },
  { id: "14_lang_es_couple", description: "Espagnol, couple", lot: "4_lang",
    args: ["--auto", "--persona", "Quiero una velada romántica", "--social", "couple", "--env", "env_shelter", "--lang", "es"] },
  { id: "15_lang_fr_reference", description: "Français référence (contrôle)", lot: "4_lang",
    args: ["--auto", "--persona", "Chercher une activité sympa entre amis", "--social", "friends", "--env", "env_home"] },

  // LOT 5 : Cas limites
  { id: "16_energy_min", description: "Seul, intérieur, peu motivé", lot: "5_limits",
    args: ["--auto", "--persona", "Je suis épuisé, zéro motivation", "--social", "solo", "--env", "env_shelter"] },
  { id: "17_energy_max", description: "Amis, extérieur, motivés", lot: "5_limits",
    args: ["--auto", "--persona", "On veut se défoncer physiquement", "--social", "friends", "--env", "env_open_air"] },
  { id: "18_any_env", description: "Environnement indifférent, famille", lot: "5_limits",
    args: ["--auto", "--persona", "On s'en fiche intérieur ou extérieur", "--social", "family", "--env", "env_home"] },

  // LOT 6 : Personas spécifiques
  { id: "19_gamer", description: "Gamer seul", lot: "6_persona",
    args: ["--auto", "--persona", "Je veux jouer à un jeu vidéo", "--social", "solo", "--env", "env_shelter"] },
  { id: "20_cinema", description: "Cinéma entre amis", lot: "6_persona",
    args: ["--auto", "--persona", "On veut aller au cinéma", "--social", "friends", "--env", "env_shelter"] },
  { id: "21_sport", description: "Sport intense", lot: "6_persona",
    args: ["--auto", "--persona", "Je veux faire du sport intense", "--social", "solo", "--env", "env_open_air"] },
  { id: "22_creative", description: "Activité créative", lot: "6_persona",
    args: ["--auto", "--persona", "Je veux créer quelque chose de mes mains", "--social", "solo", "--env", "env_shelter"] },
  { id: "23_gastronomie", description: "Sortie gastronomique", lot: "6_persona",
    args: ["--auto", "--persona", "On veut découvrir un bon restaurant", "--social", "couple", "--env", "env_shelter"] },
  { id: "24_nature", description: "Randonnée nature", lot: "6_persona",
    args: ["--auto", "--persona", "Je veux me reconnecter avec la nature", "--social", "solo", "--env", "env_open_air"] },
  { id: "25_zen", description: "Détente zen", lot: "6_persona",
    args: ["--auto", "--persona", "Je veux méditer et me recentrer", "--social", "solo", "--env", "env_shelter"] },
  { id: "26_adventure", description: "Aventure insolite", lot: "6_persona",
    args: ["--auto", "--persona", "Je cherche une expérience hors du commun", "--social", "friends", "--env", "env_open_air"] },

  // LOT 7 : Combinaisons croisées
  { id: "27_teen_winter", description: "Ados en hiver, intérieur", lot: "7_combo",
    args: ["--auto", "--persona", "Activité intérieure pour ados en hiver", "--social", "family", "--env", "env_shelter", "--children-ages", "13,16"] },
  { id: "28_friends_summer_en", description: "Amis, été, anglais", lot: "7_combo",
    args: ["--auto", "--persona", "Summer outdoor activity with friends", "--social", "friends", "--env", "env_open_air", "--lang", "en"] },
  { id: "29_family_xmas", description: "Noël en famille, enfants 4-10", lot: "7_combo",
    args: ["--auto", "--persona", "Activité de Noël en famille", "--social", "family", "--env", "env_shelter", "--children-ages", "4,10"] },
  { id: "30_full_combo", description: "Combo complet : famille, enfants", lot: "7_combo",
    args: ["--auto", "--persona", "Weekend de luxe en famille avec les enfants", "--social", "family", "--env", "env_home", "--children-ages", "6,12"] },
];

// ---------------------------------------------------------------------------
// CLI parsing
// ---------------------------------------------------------------------------
function parseArgs(): { concurrency: number; filter?: string[]; lots?: string[] } {
  const args = process.argv.slice(2);
  const opts: Record<string, string> = {};
  for (let i = 0; i < args.length; i++) {
    if (args[i] === "--concurrency") opts.concurrency = args[++i];
    else if (args[i] === "--filter") opts.filter = args[++i];
    else if (args[i] === "--lot") opts.lot = args[++i];
  }
  return {
    concurrency: parseInt(opts.concurrency ?? String(DEFAULT_CONCURRENCY), 10),
    filter: opts.filter?.split(",").map(s => s.trim()),
    lots: opts.lot?.split(",").map(s => s.trim()),
  };
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------
async function main() {
  const opts = parseArgs();

  // Filtrer les tests
  let tests = TESTS;
  if (opts.filter) {
    const keywords = opts.filter.map(k => k.toLowerCase());
    tests = tests.filter(t => keywords.some(k => t.id.toLowerCase().includes(k) || t.description.toLowerCase().includes(k)));
  }
  if (opts.lots) {
    tests = tests.filter(t => opts.lots!.some(l => t.lot.includes(l)));
  }

  if (tests.length === 0) {
    console.error("Aucun test ne correspond aux filtres.");
    process.exit(1);
  }

  mkdirSync(RUN_DIR, { recursive: true });

  console.error("============================================");
  console.error("🦉 Mogogo — Test de non-régression v2");
  console.error(`   ${new Date().toLocaleString()}`);
  console.error(`   Tests: ${tests.length} | Concurrency: ${opts.concurrency}`);
  console.error(`   Résultats: ${RUN_DIR}`);
  console.error("============================================\n");

  let completed = 0;
  const total = tests.length;

  const results = await runPool(tests, opts.concurrency, async (test) => {
    const result = await runTest(test);
    completed++;

    const icon = result.status === "pass" ? "✅" : result.status === "fail" ? "❌" : "💥";
    const info = result.steps != null
      ? `${result.steps} steps, ${result.durationMs}ms`
      : result.error?.slice(0, 80) ?? "unknown";
    const warnings = result.checks.filter(c => c.severity === "warning").length;
    const errors = result.checks.filter(c => c.severity === "error").length;
    const checkInfo = errors > 0 ? ` (${errors} err)` : warnings > 0 ? ` (${warnings} warn)` : "";

    console.error(`[${String(completed).padStart(2)}/${total}] ${icon} [${result.id}] ${result.description} — ${info}${checkInfo}${result.titre ? ` → ${result.titre}` : ""}`);
    return result;
  });

  // Rapport
  const pass = results.filter(r => r.status === "pass").length;
  const fail = results.filter(r => r.status === "fail").length;
  const crash = results.filter(r => r.status === "crash").length;
  const totalWarnings = results.reduce((sum, r) => sum + r.checks.filter(c => c.severity === "warning").length, 0);
  const totalErrors = results.reduce((sum, r) => sum + r.checks.filter(c => c.severity === "error").length, 0);

  console.error("\n============================================");
  console.error("📊 RAPPORT FINAL");
  console.error("============================================");
  console.error(`✅ Passés:  ${pass}`);
  console.error(`❌ Échoués: ${fail}`);
  console.error(`💥 Crash:   ${crash}`);
  console.error(`⚠️  Warnings: ${totalWarnings} | Erreurs: ${totalErrors}`);
  console.error(`Total: ${results.length}`);

  // Détail des échecs
  const failures = results.filter(r => r.status !== "pass");
  if (failures.length > 0) {
    console.error("\n--- Détail des problèmes ---");
    for (const r of failures) {
      console.error(`\n[${r.id}] ${r.description} (${r.status})`);
      if (r.error) console.error(`  Erreur: ${r.error}`);
      for (const c of r.checks) {
        const icon = c.severity === "error" ? "  ❌" : "  ⚠️ ";
        console.error(`${icon} ${c.code}: ${c.message}`);
      }
    }
  }

  // Warnings des tests passés
  const passWithWarnings = results.filter(r => r.status === "pass" && r.checks.some(c => c.severity === "warning"));
  if (passWithWarnings.length > 0) {
    console.error("\n--- Warnings sur tests passés ---");
    for (const r of passWithWarnings) {
      const warnings = r.checks.filter(c => c.severity === "warning");
      console.error(`[${r.id}] ${warnings.map(c => c.code).join(", ")}`);
    }
  }

  // Résumé par lot
  const lots = [...new Set(results.map(r => r.lot))];
  console.error("\n--- Par lot ---");
  for (const lot of lots) {
    const lotResults = results.filter(r => r.lot === lot);
    const lotPass = lotResults.filter(r => r.status === "pass").length;
    console.error(`  ${lot}: ${lotPass}/${lotResults.length} passés`);
  }

  // Sauvegarder le rapport JSON
  const summary = {
    timestamp: TIMESTAMP,
    pass,
    fail,
    crash,
    totalWarnings,
    totalErrors,
    tests: results.map(r => ({
      id: r.id,
      description: r.description,
      lot: r.lot,
      status: r.status,
      steps: r.steps,
      durationMs: r.durationMs,
      titre: r.titre,
      errors: r.checks.filter(c => c.severity === "error").map(c => c.code),
      warnings: r.checks.filter(c => c.severity === "warning").map(c => c.code),
    })),
  };

  writeFileSync(resolve(RUN_DIR, "summary.json"), JSON.stringify(summary, null, 2));
  console.error(`\nRésumé sauvegardé: ${RUN_DIR}/summary.json`);
  console.error("============================================\n");

  // Exit code non-zero si des échecs
  process.exit(fail + crash > 0 ? 1 : 0);
}

main();
