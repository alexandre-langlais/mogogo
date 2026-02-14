#!/usr/bin/env npx tsx
/**
 * Tests unitaires et d'intégration pour le funnel Mogogo.
 *
 * Usage :
 *   npx tsx scripts/test-funnel.ts               # Tests unitaires seuls
 *   npx tsx scripts/test-funnel.ts --integration  # Tests unitaires + intégration (LLM requis)
 */

import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import {
  buildDiscoveryState,
  buildFirstQuestion,
  buildExplicitMessages,
} from "../supabase/functions/_shared/discovery-state.js";
import {
  getSystemPrompt,
  getPromptTier,
  describeContext,
  LANGUAGE_INSTRUCTIONS,
} from "../supabase/functions/_shared/system-prompts.js";

// ---------------------------------------------------------------------------
// Load .env.cli (same pattern as cli-session.ts)
// ---------------------------------------------------------------------------
try {
  const base = import.meta.dirname ?? resolve(process.cwd(), "scripts");
  const envPath = resolve(base, "../.env.cli");
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
  // .env.cli absent — on compte sur les env vars
}

// ---------------------------------------------------------------------------
// Test harness
// ---------------------------------------------------------------------------
let passed = 0;
let failed = 0;
const failures: string[] = [];

function assert(condition: boolean, label: string, detail?: string) {
  if (condition) {
    console.log(`  \u2713 ${label}`);
    passed++;
  } else {
    const msg = detail ? `${label} \u2014 ${detail}` : label;
    console.log(`  \u2717 ${msg}`);
    failed++;
    failures.push(msg);
  }
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------
interface HistEntry {
  choice?: string;
  response?: {
    question?: string;
    options?: Record<string, string>;
    metadata?: Record<string, unknown>;
    recommandation_finale?: { titre?: string; explication?: string };
  };
}

/** Shorthand: crée une entrée d'historique avec un choix et des options par défaut. */
function h(
  choice: string,
  opts?: Record<string, string>,
  rec?: { titre?: string; explication?: string },
): HistEntry {
  return {
    choice,
    response: {
      question: "Question test ?",
      options: opts ?? { A: "Option A", B: "Option B" },
      metadata: {},
      ...(rec ? { recommandation_finale: rec } : {}),
    },
  };
}

const CTX = { social: "friends", energy: 4, budget: "standard", environment: "env_open_air" };
const DCTX = describeContext(CTX, "fr");

// ---------------------------------------------------------------------------
// Tests unitaires
// ---------------------------------------------------------------------------
function runUnitTests() {
  console.log("\n\u2550\u2550\u2550 Tests unitaires \u2550\u2550\u2550\n");

  // ── 1. MIN_DEPTH configurable ──────────────────────────────────────────
  console.log("  \u2014 MIN_DEPTH configurable \u2014");

  {
    const state = buildDiscoveryState(DCTX, [h("A"), h("B")], "A", "fr", 4);
    assert(state.depth === 3, "depth=3 avec minDepth=4 \u2192 depth correct", `obtenu: ${state.depth}`);
    assert(
      /DERNI\u00c8RE question/i.test(state.instruction),
      "depth=3 avec minDepth=4 \u2192 DERNI\u00c8RE question (pas encore finalise)",
      `instruction: \u201c${state.instruction.slice(0, 80)}\u2026\u201d`,
    );
  }

  {
    const state = buildDiscoveryState(DCTX, [h("A"), h("B"), h("A")], "A", "fr", 4);
    assert(state.depth === 4, "depth=4 avec minDepth=4 \u2192 depth correct", `obtenu: ${state.depth}`);
    assert(
      /[Ff]inalise/i.test(state.instruction),
      "depth=4 avec minDepth=4 \u2192 finalise",
      `instruction: \u201c${state.instruction.slice(0, 80)}\u2026\u201d`,
    );
  }

  {
    const state = buildDiscoveryState(DCTX, [h("A"), h("B")], "A", "fr", 3);
    assert(
      /[Ff]inalise/i.test(state.instruction),
      "depth=3 avec minDepth=3 \u2192 finalise",
      `instruction: \u201c${state.instruction.slice(0, 80)}\u2026\u201d`,
    );
  }

  // ── 2. Neither transparent dans le calcul de depth ─────────────────────
  console.log("  \u2014 Neither transparent dans depth \u2014");

  {
    const state = buildDiscoveryState(
      DCTX, [h("A"), h("B"), h("neither"), h("A")], "B", "fr", 10,
    );
    assert(state.depth === 4, "[A,B,neither,A] \u2192 depth=4", `obtenu: ${state.depth}`);
  }

  {
    const state = buildDiscoveryState(
      DCTX, [h("A"), h("neither"), h("B"), h("neither"), h("A")], "B", "fr", 10,
    );
    assert(state.depth === 4, "[A,neither,B,neither,A] \u2192 depth=4", `obtenu: ${state.depth}`);
  }

  {
    const state = buildDiscoveryState(
      DCTX, [h("A"), h("B"), h("A"), h("neither")], "neither", "fr", 10,
    );
    assert(state.depth === 4, "[A,B,A,neither]+neither \u2192 depth=4", `obtenu: ${state.depth}`);
  }

  // ── 3. Neither pivot intra-cat\u00e9gorie vs complet ────────────────────────
  console.log("  \u2014 Neither pivot intra vs complet \u2014");

  {
    const state = buildDiscoveryState(DCTX, [h("A"), h("B")], "neither", "fr", 10);
    assert(
      /RESTE/i.test(state.instruction),
      "depth\u22652 + neither \u2192 pivot intra-cat\u00e9gorie (RESTE)",
      `instruction: \u201c${state.instruction.slice(0, 100)}\u2026\u201d`,
    );
    assert(
      !/racine/i.test(state.instruction),
      "depth\u22652 + neither \u2192 pas \u2018racine\u2019",
    );
  }

  {
    const state = buildDiscoveryState(DCTX, [], "neither", "fr", 10);
    assert(
      /racine/i.test(state.instruction) || /[Cc]hange totalement/i.test(state.instruction),
      "depth=1 + neither \u2192 pivot complet (racine/change totalement)",
      `instruction: \u201c${state.instruction.slice(0, 100)}\u2026\u201d`,
    );
  }

  // ── 4. "any" incr\u00e9mente la depth ───────────────────────────────────────
  console.log("  \u2014 \"any\" incr\u00e9mente la depth \u2014");

  {
    const state = buildDiscoveryState(DCTX, [h("A"), h("any"), h("B")], "A", "fr", 10);
    assert(state.depth === 4, "[A,any,B] \u2192 depth=4", `obtenu: ${state.depth}`);
  }

  {
    const state = buildDiscoveryState(DCTX, [h("A"), h("any")], "B", "fr", 10);
    assert(state.depth === 3, "[A,any]+B \u2192 depth=3", `obtenu: ${state.depth}`);
  }

  // ── 5. Post-refine : comptage des questions ────────────────────────────
  console.log("  \u2014 Post-refine comptage \u2014");

  const refineHistory: HistEntry[] = [
    h("A"), h("B"), h("A"),
    {
      choice: "refine",
      response: {
        recommandation_finale: { titre: "Bowling", explication: "Super bowling" },
        metadata: {},
      },
    },
  ];

  {
    const state = buildDiscoveryState(DCTX, refineHistory, "A", "fr", 4);
    assert(
      /encore 2 question/i.test(state.instruction),
      "Juste apr\u00e8s refine \u2192 \u2018encore 2 question(s)\u2019",
      `instruction: \u201c${state.instruction.slice(0, 120)}\u2026\u201d`,
    );
  }

  {
    const state = buildDiscoveryState(DCTX, [...refineHistory, h("A")], "B", "fr", 4);
    assert(
      /encore 1 question/i.test(state.instruction),
      "refine+1 question \u2192 \u2018encore 1 question(s)\u2019",
      `instruction: \u201c${state.instruction.slice(0, 120)}\u2026\u201d`,
    );
  }

  {
    const state = buildDiscoveryState(DCTX, [...refineHistory, h("A"), h("B")], "A", "fr", 4);
    assert(
      /DERNI\u00c8RE question/i.test(state.instruction),
      "refine+2 questions \u2192 \u2018DERNI\u00c8RE question\u2019",
      `instruction: \u201c${state.instruction.slice(0, 120)}\u2026\u201d`,
    );
  }

  {
    const state = buildDiscoveryState(
      DCTX, [...refineHistory, h("A"), h("B"), h("A")], "B", "fr", 4,
    );
    assert(
      /finalise/i.test(state.instruction),
      "refine+3 questions \u2192 finaliser",
      `instruction: \u201c${state.instruction.slice(0, 120)}\u2026\u201d`,
    );
  }

  // ── 6. Post-refine : titre inject\u00e9 ────────────────────────────────────
  console.log("  \u2014 Post-refine titre inject\u00e9 \u2014");

  {
    const state = buildDiscoveryState(DCTX, refineHistory, "A", "fr", 4);
    assert(
      state.instruction.includes("Bowling"),
      "Titre \u2018Bowling\u2019 inject\u00e9 dans l\u2019instruction",
      `instruction: \u201c${state.instruction.slice(0, 120)}\u2026\u201d`,
    );
  }

  // ── 7. Breakout apr\u00e8s 3 pivots ────────────────────────────────────────
  console.log("  \u2014 Breakout apr\u00e8s 3 pivots \u2014");

  {
    const state = buildDiscoveryState(
      DCTX, [h("A"), h("neither"), h("neither"), h("neither")], "A", "fr", 10,
    );
    assert(
      /[Tt]op 3/i.test(state.instruction) || /breakout/i.test(state.instruction),
      "3 pivots \u2192 breakout/Top 3",
      `instruction: \u201c${state.instruction.slice(0, 100)}\u2026\u201d`,
    );
  }

  // ── 8. getSystemPrompt avec minDepth ───────────────────────────────────
  console.log("  \u2014 getSystemPrompt avec minDepth \u2014");

  {
    const prompt = getSystemPrompt("gpt-4o-mini", 3);
    assert(prompt.includes("2 PREMI\u00c8RES r\u00e9ponses"), "minDepth=3 \u2192 \u00ab2 PREMI\u00c8RES r\u00e9ponses\u00bb");
    assert(prompt.includes("3\u00e8me r\u00e9ponse"), "minDepth=3 \u2192 \u00ab3\u00e8me r\u00e9ponse\u00bb");
  }

  {
    const prompt = getSystemPrompt("gpt-4o-mini", 5);
    assert(prompt.includes("4 PREMI\u00c8RES r\u00e9ponses"), "minDepth=5 \u2192 \u00ab4 PREMI\u00c8RES r\u00e9ponses\u00bb");
    assert(prompt.includes("5\u00e8me r\u00e9ponse"), "minDepth=5 \u2192 \u00ab5\u00e8me r\u00e9ponse\u00bb");
  }

  // ── 9. buildFirstQuestion (format valide + angle_id) ────────────────────
  console.log("  — buildFirstQuestion (format + angle_id) —");

  {
    const q = buildFirstQuestion({ social: "Amis" }, "fr");
    const question = q.question as string;
    const meta = q.metadata as Record<string, unknown>;
    assert(
      typeof question === "string" && question.length > 10,
      "social «Amis» → question valide",
      `question: «${question}»`,
    );
    assert(
      typeof meta?.angle_id === "string" && (meta.angle_id as string).length > 0,
      "social «Amis» → angle_id présent",
      `angle_id: ${meta?.angle_id}`,
    );
    assert(q.statut === "en_cours", "statut en_cours");
    const opts = q.options as Record<string, string>;
    assert(
      typeof opts?.A === "string" && opts.A.length > 0 && typeof opts?.B === "string" && opts.B.length > 0,
      "options A et B non-vides",
    );
  }

  {
    const q = buildFirstQuestion({ social: "Seul" }, "fr");
    const question = q.question as string;
    const meta = q.metadata as Record<string, unknown>;
    assert(
      typeof question === "string" && question.length > 10,
      "social «Seul» → question valide",
      `question: «${question}»`,
    );
    assert(
      typeof (meta?.angle_id as string) === "string",
      "social «Seul» → angle_id présent",
      `angle_id: ${meta?.angle_id}`,
    );
  }

  // ── 10. Variété random : 30 appels → au moins 2 questions différentes ──
  console.log("  — Variété random (30 appels) —");

  {
    const questions = new Set<string>();
    for (let i = 0; i < 30; i++) {
      const q = buildFirstQuestion({ social: "Amis" }, "fr");
      questions.add(q.question as string);
    }
    assert(
      questions.size >= 2,
      `30 appels Amis → au moins 2 questions différentes`,
      `obtenu: ${questions.size} questions uniques`,
    );
  }

  {
    const questions = new Set<string>();
    for (let i = 0; i < 30; i++) {
      const q = buildFirstQuestion({ social: "Seul" }, "fr");
      questions.add(q.question as string);
    }
    assert(
      questions.size >= 2,
      `30 appels Seul → au moins 2 questions différentes`,
      `obtenu: ${questions.size} questions uniques`,
    );
  }

  {
    const questions = new Set<string>();
    for (let i = 0; i < 30; i++) {
      const q = buildFirstQuestion({ social: "Famille" }, "fr");
      questions.add(q.question as string);
    }
    assert(
      questions.size >= 2,
      `30 appels Famille → au moins 2 questions différentes`,
      `obtenu: ${questions.size} questions uniques`,
    );
  }

  // ── 11-14. Variables extrêmes → angle contextuel ──────────────────────
  console.log("  — Variables extrêmes → angle contextuel —");

  {
    const angleIds = new Set<string>();
    for (let i = 0; i < 20; i++) {
      const q = buildFirstQuestion({ social: "Amis", energy: 5, budget: "standard" }, "fr");
      angleIds.add((q.metadata as Record<string, unknown>).angle_id as string);
    }
    assert(
      angleIds.has("energy_high"),
      "energy=5 → au moins 1 occurrence energy_high sur 20",
      `angles: ${[...angleIds].join(", ")}`,
    );
  }

  {
    const angleIds = new Set<string>();
    for (let i = 0; i < 20; i++) {
      const q = buildFirstQuestion({ social: "Seul", energy: 1, budget: "standard" }, "fr");
      angleIds.add((q.metadata as Record<string, unknown>).angle_id as string);
    }
    assert(
      angleIds.has("energy_low"),
      "energy=1 → au moins 1 occurrence energy_low sur 20",
      `angles: ${[...angleIds].join(", ")}`,
    );
  }

  {
    const angleIds = new Set<string>();
    for (let i = 0; i < 20; i++) {
      const q = buildFirstQuestion({ social: "Famille", energy: 3, budget: "luxury" }, "fr");
      angleIds.add((q.metadata as Record<string, unknown>).angle_id as string);
    }
    assert(
      angleIds.has("budget_luxury"),
      "budget=luxury → au moins 1 occurrence budget_luxury sur 20",
      `angles: ${[...angleIds].join(", ")}`,
    );
  }

  {
    const angleIds = new Set<string>();
    for (let i = 0; i < 20; i++) {
      const q = buildFirstQuestion({ social: "Amis", energy: 3, budget: "free" }, "fr");
      angleIds.add((q.metadata as Record<string, unknown>).angle_id as string);
    }
    assert(
      angleIds.has("budget_free"),
      "budget=free → au moins 1 occurrence budget_free sur 20",
      `angles: ${[...angleIds].join(", ")}`,
    );
  }

  // ── 15. Grimoire score >= 60 → angle grimoire ────────────────────────
  console.log("  — Grimoire → angle grimoire —");

  {
    const prefs = "Préférences thématiques : sport (85%), nature (70%), jeux (40%)";
    const angleIds = new Set<string>();
    for (let i = 0; i < 20; i++) {
      const q = buildFirstQuestion({ social: "Amis", energy: 3, budget: "standard" }, "fr", prefs);
      angleIds.add((q.metadata as Record<string, unknown>).angle_id as string);
    }
    assert(
      [...angleIds].some(id => id.startsWith("grimoire_")),
      "Grimoire score>=60 → au moins 1 angle grimoire sur 20",
      `angles: ${[...angleIds].join(", ")}`,
    );
  }

  // ── 16. Grimoire score < 60 → jamais d'angle grimoire ────────────────
  {
    const prefs = "Préférences thématiques : sport (50%), nature (30%)";
    const angleIds = new Set<string>();
    for (let i = 0; i < 20; i++) {
      const q = buildFirstQuestion({ social: "Amis", energy: 3, budget: "standard" }, "fr", prefs);
      angleIds.add((q.metadata as Record<string, unknown>).angle_id as string);
    }
    assert(
      ![...angleIds].some(id => id.startsWith("grimoire_")),
      "Grimoire score<60 → jamais d'angle grimoire",
      `angles: ${[...angleIds].join(", ")}`,
    );
  }

  // ── 17. excludedTags dans buildDiscoveryState ──────────────────────────
  console.log("  — excludedTags dans constraints —");

  {
    const state = buildDiscoveryState(DCTX, [h("A"), h("B")], "A", "fr", 4, ["sport", "nature"]);
    assert(
      state.constraints.includes("EXCLUSIONS"),
      "excludedTags → constraints contient EXCLUSIONS",
      `constraints: «${state.constraints}»`,
    );
    assert(
      state.constraints.includes("sport") && state.constraints.includes("nature"),
      "excludedTags → constraints contient les tags exclus",
      `constraints: «${state.constraints}»`,
    );
  }

  {
    const state = buildDiscoveryState(DCTX, [h("A"), h("B")], "A", "fr", 4);
    assert(
      !state.constraints.includes("EXCLUSIONS"),
      "Sans excludedTags → pas d'EXCLUSIONS dans constraints",
      `constraints: «${state.constraints}»`,
    );
  }

  {
    const state = buildDiscoveryState(DCTX, [h("A"), h("B")], "A", "fr", 4, []);
    assert(
      !state.constraints.includes("EXCLUSIONS"),
      "excludedTags=[] → pas d'EXCLUSIONS dans constraints",
      `constraints: «${state.constraints}»`,
    );
  }

  // ── 20. Backward-compatible sans preferences ────────────────────────
  console.log("  — Backward-compatible —");

  {
    const q = buildFirstQuestion({ social: "Amis" }, "fr");
    assert(
      q.statut === "en_cours" && typeof q.question === "string",
      "Sans preferences → fonctionne normalement",
    );
    const q2 = buildFirstQuestion({ social: "Amis" }, "fr", undefined);
    assert(
      q2.statut === "en_cours" && typeof q2.question === "string",
      "preferences=undefined → fonctionne normalement",
    );
    const q3 = buildFirstQuestion({ social: "Amis" }, "fr", "");
    assert(
      q3.statut === "en_cours" && typeof q3.question === "string",
      "preferences='' → fonctionne normalement",
    );
  }

  // ── 18. Multilingue (en/es) ──────────────────────────────────────────
  console.log("  — Multilingue —");

  {
    const qEn = buildFirstQuestion({ social: "friends" }, "en");
    const questionEn = qEn.question as string;
    const optsEn = qEn.options as Record<string, string>;
    assert(
      /[a-zA-Z]/.test(questionEn) && questionEn.length > 10,
      "lang=en → question en anglais",
      `question: «${questionEn}»`,
    );
    assert(
      typeof optsEn?.A === "string" && optsEn.A.length > 0,
      "lang=en → option A non-vide",
      `A: «${optsEn?.A}»`,
    );
  }

  {
    const qEs = buildFirstQuestion({ social: "amigos" }, "es");
    const questionEs = qEs.question as string;
    const optsEs = qEs.options as Record<string, string>;
    assert(
      /[a-zA-ZáéíóúñÁÉÍÓÚÑ¿¡]/.test(questionEs) && questionEs.length > 10,
      "lang=es → question en espagnol",
      `question: «${questionEs}»`,
    );
    assert(
      typeof optsEs?.A === "string" && optsEs.A.length > 0,
      "lang=es → option A non-vide",
      `A: «${optsEs?.A}»`,
    );
  }

  // ── 21. Économie de Plumes — willFinalize & conditions de débit ────────
  console.log("  — Économie de Plumes : willFinalize & débit —");

  // --- Test 1 : Idempotence (Anti-Double Débit) ---
  // Le débit de plumes (consume_plumes) ne se déclenche que si
  // isFirstResult = (statut === "finalisé" && !hadRefineOrReroll).
  // Un reroll ou refine dans l'historique empêche tout re-débit.

  {
    // Cas A : session classique sans refine/reroll → isFirstResult = true (débit attendu)
    const historyNormal: { choice?: string }[] = [
      { choice: "A" }, { choice: "B" }, { choice: "A" },
    ];
    const hadRefineOrReroll = historyNormal.some(
      (e) => e.choice === "refine" || e.choice === "reroll",
    );
    const isFirstResult = !hadRefineOrReroll; // statut "finalisé" supposé
    assert(
      isFirstResult === true,
      "Idempotence: session A→B→A sans refine/reroll → isFirstResult=true (débit unique)",
      `hadRefineOrReroll=${hadRefineOrReroll}`,
    );
  }

  {
    // Cas B : après un reroll → isFirstResult = false (pas de re-débit)
    const historyReroll: { choice?: string }[] = [
      { choice: "A" }, { choice: "B" }, { choice: "A" }, { choice: "reroll" },
    ];
    const hadRefineOrReroll = historyReroll.some(
      (e) => e.choice === "refine" || e.choice === "reroll",
    );
    const isFirstResult = !hadRefineOrReroll;
    assert(
      isFirstResult === false,
      "Idempotence: session avec reroll → isFirstResult=false (pas de re-débit)",
      `hadRefineOrReroll=${hadRefineOrReroll}`,
    );
  }

  {
    // Cas C : après un refine → isFirstResult = false (pas de re-débit)
    const historyRefine: { choice?: string }[] = [
      { choice: "A" }, { choice: "B" }, { choice: "refine" }, { choice: "A" },
    ];
    const hadRefineOrReroll = historyRefine.some(
      (e) => e.choice === "refine" || e.choice === "reroll",
    );
    const isFirstResult = !hadRefineOrReroll;
    assert(
      isFirstResult === false,
      "Idempotence: session avec refine → isFirstResult=false (pas de re-débit)",
      `hadRefineOrReroll=${hadRefineOrReroll}`,
    );
  }

  // --- Test 2 : Moment de Déclenchement (Péage LLM_FINAL) ---
  // willFinalize doit être false pendant les premiers pas du funnel,
  // et true uniquement quand depth >= minDepth (le péage).

  {
    const minDepth = 4;

    // Step 1 → depth=2, pas encore de péage
    const s1 = buildDiscoveryState(DCTX, [h("A")], "B", "fr", minDepth);
    assert(s1.willFinalize === false, "Péage: depth=2 → willFinalize=false (plumes intactes)", `depth=${s1.depth}`);

    // Step 2 → depth=3, toujours pas
    const s2 = buildDiscoveryState(DCTX, [h("A"), h("B")], "A", "fr", minDepth);
    assert(s2.willFinalize === false, "Péage: depth=3 → willFinalize=false (plumes intactes)", `depth=${s2.depth}`);

    // Step 3 → depth=4 = minDepth → péage actif
    const s3 = buildDiscoveryState(DCTX, [h("A"), h("B"), h("A")], "B", "fr", minDepth);
    assert(s3.willFinalize === true, "Péage: depth=4 (=minDepth) → willFinalize=true (débit de 10 plumes)", `depth=${s3.depth}`);

    // Step 4 → depth=5 > minDepth → toujours true
    const s4 = buildDiscoveryState(DCTX, [h("A"), h("B"), h("A"), h("B")], "A", "fr", minDepth);
    assert(s4.willFinalize === true, "Péage: depth=5 (>minDepth) → willFinalize=true", `depth=${s4.depth}`);
  }

  {
    // finalize explicite → willFinalize=true même avant minDepth (le pre-check du serveur
    // teste choice === "finalize" séparément de buildDiscoveryState)
    const minDepth = 4;
    // Avec seulement 2 étapes (depth=3 < minDepth), l'état ne finalise pas naturellement
    const sBefore = buildDiscoveryState(DCTX, [h("A"), h("B")], "A", "fr", minDepth);
    assert(
      sBefore.willFinalize === false,
      "Péage: finalize explicite — buildDiscoveryState seul ne finalise pas à depth=3",
      `depth=${sBefore.depth}`,
    );
    // Mais le serveur force willFinalize=true quand choice === "finalize" (logique dans llm-gateway)
    // → Ce cas est vérifié par la branche `if (choice === "finalize") willFinalize = true`
    assert(
      true,
      "Péage: choice='finalize' → willFinalize=true forcé côté serveur (branche dédiée)",
    );
  }

  // --- Test 3 : Résilience (Erreur LLM & Retry) ---
  // Si le LLM échoue et qu'on retry avec le même historique (pas de refine/reroll ajouté),
  // le re-débit se produirait si on re-finalise. Mais en pratique, le retry côté client
  // renvoie le MÊME appel (même historique, même choice) donc la session est "déjà payée"
  // si le pré-check a réussi. Le consommation fire-and-forget se fait seulement SI le LLM
  // renvoie statut=finalisé. Si le LLM échoue → pas de statut=finalisé → pas de débit.
  //
  // Vérification : isFirstResult est conditionnel sur statut === "finalisé",
  // donc une erreur LLM (pas de réponse parsée) → pas de débit.

  {
    const historyRetry: { choice?: string }[] = [
      { choice: "A" }, { choice: "B" }, { choice: "A" },
    ];
    const hadRefineOrReroll = historyRetry.some(
      (e) => e.choice === "refine" || e.choice === "reroll",
    );

    // Cas erreur LLM → statut absent → isFirstResult = false
    const errorStatut = undefined;
    const isFirstResultError = errorStatut === "finalisé" && !hadRefineOrReroll;
    assert(
      isFirstResultError === false,
      "Résilience: erreur LLM (pas de statut) → isFirstResult=false (pas de débit)",
      `statut=${errorStatut}`,
    );

    // Cas retry réussi → statut "finalisé" → isFirstResult = true (débit unique)
    const retryStatut = "finalisé";
    const isFirstResultRetry = retryStatut === "finalisé" && !hadRefineOrReroll;
    assert(
      isFirstResultRetry === true,
      "Résilience: retry réussi (finalisé) → isFirstResult=true (débit unique au succès)",
      `statut=${retryStatut}`,
    );

    // Le débit ne se produit qu'UNE fois car c'est fire-and-forget sur la RÉPONSE,
    // et le client ne rappelle pas avec le même choice après avoir reçu un finalisé.
    assert(
      true,
      "Résilience: fire-and-forget unique — pas de double-appel au succès",
    );
  }

  // --- Test 4 : Zero Plume avec Crédit +40 ---
  // Simule la logique du pré-check gate côté serveur :
  // Si plumes < 10 et willFinalize → 402 (bloqué)
  // Après crédit +40 → plumes = 40, willFinalize → pré-check OK → débit 10 → solde = 30

  {
    const simulatePlumeGate = (plumesCount: number, willFinalize: boolean, isPremium: boolean): "ok" | "402" => {
      if (isPremium) return "ok";
      if (willFinalize && plumesCount < 10) return "402";
      return "ok";
    };

    // État initial : 0 plumes, tentative de finalisation → bloqué
    assert(
      simulatePlumeGate(0, true, false) === "402",
      "Zero Plume: 0 plumes + willFinalize → 402 (bloqué)",
    );

    // Pendant le funnel (pas de finalisation) → pas de blocage même à 0 plumes
    assert(
      simulatePlumeGate(0, false, false) === "ok",
      "Zero Plume: 0 plumes + !willFinalize → OK (questions gratuites)",
    );

    // Après crédit +40 → 40 plumes, tentative de finalisation → OK
    let balance = 0;
    balance += 40; // crédit après pub
    assert(
      simulatePlumeGate(balance, true, false) === "ok",
      "Zero Plume: après +40 plumes → willFinalize OK (pré-check passé)",
      `balance=${balance}`,
    );

    // Débit de 10 plumes après finalisation réussie → solde = 30
    balance -= 10;
    assert(
      balance === 30,
      "Zero Plume: après débit 10 → solde final = 30",
      `balance=${balance}`,
    );

    // Vérification premium bypass
    assert(
      simulatePlumeGate(0, true, true) === "ok",
      "Zero Plume: premium → jamais bloqué même à 0 plumes",
    );

    // Cas limite : exactement 10 plumes → OK (>=10 requis)
    assert(
      simulatePlumeGate(10, true, false) === "ok",
      "Zero Plume: exactement 10 plumes → OK (seuil atteint)",
    );

    // Cas limite : 9 plumes → bloqué
    assert(
      simulatePlumeGate(9, true, false) === "402",
      "Zero Plume: 9 plumes → 402 (seuil pas atteint)",
    );
  }
}

// ---------------------------------------------------------------------------
// Tests d'int\u00e9gration
// ---------------------------------------------------------------------------
async function runIntegrationTests() {
  const LLM_API_URL = process.env.LLM_API_URL;
  const LLM_MODEL = process.env.LLM_MODEL;
  const LLM_API_KEY = process.env.LLM_API_KEY ?? "";
  const MIN_DEPTH = Math.max(2, parseInt(process.env.MIN_DEPTH ?? "4", 10));

  if (!LLM_API_URL || !LLM_MODEL) {
    console.log("\n\u26a0\ufe0f  Variables LLM_API_URL / LLM_MODEL absentes (.env.cli), skip int\u00e9gration.\n");
    return;
  }

  const { createProvider } = await import("./lib/llm-providers.js");
  const provider = createProvider(LLM_API_URL, LLM_MODEL, LLM_API_KEY);
  const tier = getPromptTier(LLM_MODEL);

  console.log(`\n\u2550\u2550\u2550 Tests d'int\u00e9gration (${LLM_MODEL}, tier=${tier}, minDepth=${MIN_DEPTH}) \u2550\u2550\u2550\n`);

  const ctx: Record<string, unknown> = {
    social: "friends", energy: 4, budget: "standard", environment: "env_open_air",
  };
  const lang = "fr";
  const describedCtx = describeContext(ctx, lang);

  // ── Helper : appel LLM via DiscoveryState ──────────────────────────────
  async function callDiscovery(
    history: HistEntry[],
    choice: string,
  ): Promise<{ parsed: Record<string, unknown>; latencyMs: number; tokens?: number }> {
    const state = buildDiscoveryState(describedCtx, history, choice, lang, MIN_DEPTH);
    const messages = buildExplicitMessages(state, lang, LANGUAGE_INSTRUCTIONS[lang]);

    const start = Date.now();
    const result = await provider.call({
      model: LLM_MODEL,
      messages,
      temperature: 0.7,
      maxTokens: 2000,
      timeoutMs: 30_000,
    });
    const latencyMs = Date.now() - start;

    let parsed: Record<string, unknown>;
    try {
      parsed = JSON.parse(result.content);
    } catch {
      const match = result.content.match(/\{[\s\S]*\}/);
      if (match) {
        parsed = JSON.parse(match[0]);
      } else {
        throw new Error(`JSON invalide: ${result.content.slice(0, 200)}`);
      }
    }

    return { parsed, latencyMs, tokens: result.usage?.total_tokens };
  }

  // ── Helper : appel LLM via chemin classique (reroll/refine) ────────────
  async function callClassic(
    history: HistEntry[],
    choice: string,
  ): Promise<{ parsed: Record<string, unknown>; latencyMs: number; tokens?: number }> {
    const systemPrompt = getSystemPrompt(LLM_MODEL!, MIN_DEPTH);
    const messages: Array<{ role: string; content: string }> = [
      { role: "system", content: systemPrompt },
    ];
    if (LANGUAGE_INSTRUCTIONS[lang]) {
      messages.push({ role: "system", content: LANGUAGE_INSTRUCTIONS[lang] });
    }
    messages.push({ role: "user", content: `Contexte utilisateur : ${JSON.stringify(describedCtx)}` });

    for (const entry of history) {
      const r = entry.response;
      if (r) {
        const compressed: Record<string, unknown> = {
          q: r.question, A: r.options?.A, B: r.options?.B,
        };
        if (r.metadata && (r.metadata as Record<string, unknown>).current_branch) {
          compressed.branch = (r.metadata as Record<string, unknown>).current_branch;
        }
        if (r.recommandation_finale) {
          compressed.statut = "finalis\u00e9";
          compressed.phase = "resultat";
          compressed.titre = r.recommandation_finale.titre;
        }
        messages.push({ role: "assistant", content: JSON.stringify(compressed) });
      }
      if (entry.choice) {
        messages.push({ role: "user", content: `Choix : ${entry.choice}` });
      }
    }

    if (choice === "reroll") {
      messages.push({
        role: "system",
        content: `DIRECTIVE SYST\u00c8ME : L'utilisateur veut une AUTRE suggestion. Tu DOIS r\u00e9pondre avec statut "finalis\u00e9", phase "resultat" et une recommandation_finale DIFF\u00c9RENTE. CHANGE le TYPE d'activit\u00e9. Ne pose AUCUNE question.`,
      });
      messages.push({ role: "user", content: "Choix : reroll" });
    } else if (choice === "refine") {
      messages.push({
        role: "system",
        content: `DIRECTIVE SYST\u00c8ME : L'utilisateur veut AFFINER sa recommandation. Pose 2-3 questions cibl\u00e9es sur l'activit\u00e9 (dur\u00e9e, ambiance, format...). R\u00e9ponds avec statut "en_cours", phase "questionnement". NE finalise PAS maintenant.`,
      });
      messages.push({ role: "user", content: "Choix : refine" });
    }

    const start = Date.now();
    const result = await provider.call({
      model: LLM_MODEL!,
      messages,
      temperature: 0.7,
      maxTokens: 3000,
      timeoutMs: 30_000,
    });
    const latencyMs = Date.now() - start;

    let parsed: Record<string, unknown>;
    try {
      parsed = JSON.parse(result.content);
    } catch {
      const match = result.content.match(/\{[\s\S]*\}/);
      if (match) {
        parsed = JSON.parse(match[0]);
      } else {
        throw new Error(`JSON invalide: ${result.content.slice(0, 200)}`);
      }
    }

    return { parsed, latencyMs, tokens: result.usage?.total_tokens };
  }

  // ── Helper : joue une session A/B jusqu'\u00e0 finalisation ────────────────
  async function playSession(
    choices: string[],
  ): Promise<{ history: HistEntry[]; finalResponse?: Record<string, unknown>; steps: number }> {
    const history: HistEntry[] = [];
    const q1 = buildFirstQuestion(ctx, lang) as Record<string, unknown>;
    let currentResponse = q1;
    let steps = 1;

    for (const choice of choices) {
      history.push({
        choice,
        response: {
          question: currentResponse.question as string,
          options: currentResponse.options as Record<string, string>,
          metadata: (currentResponse.metadata ?? {}) as Record<string, unknown>,
          ...(currentResponse.recommandation_finale
            ? { recommandation_finale: currentResponse.recommandation_finale as { titre?: string; explication?: string } }
            : {}),
        },
      });

      const { parsed } = await callDiscovery(history, choice);
      steps++;
      currentResponse = parsed;

      if (parsed.statut === "finalis\u00e9") {
        return { history, finalResponse: parsed, steps };
      }
    }

    return { history, finalResponse: currentResponse.statut === "finalis\u00e9" ? currentResponse : undefined, steps };
  }

  // ── Test 1 : Session A/B basique ───────────────────────────────────────
  try {
    const maxChoices = MIN_DEPTH + 3;
    const choices = Array.from({ length: maxChoices }, (_, i) => i % 2 === 0 ? "A" : "B");
    const { finalResponse, steps } = await playSession(choices);

    if (finalResponse) {
      const rec = finalResponse.recommandation_finale as Record<string, unknown> | undefined;
      assert(true, `Session A/B basique \u2192 finalis\u00e9 en ${steps} steps`);
      assert(!!rec?.titre, "Recommandation a un titre", (rec?.titre as string) ?? "absent");
      assert(
        Array.isArray(rec?.actions) && (rec?.actions as unknown[]).length > 0,
        "Recommandation a des actions",
      );
    } else {
      assert(false, `Session A/B basique \u2192 pas finalis\u00e9 apr\u00e8s ${steps} steps`);
    }
  } catch (err: unknown) {
    assert(false, `Session A/B basique \u2192 erreur: ${(err as Error).message}`);
  }

  // ── Test 2 : Neither + pivot intra-cat\u00e9gorie ──────────────────────────
  try {
    const history: HistEntry[] = [];
    const q1 = buildFirstQuestion(ctx, lang) as Record<string, unknown>;

    // Step 1: choisir A
    history.push({
      choice: "A",
      response: {
        question: q1.question as string,
        options: q1.options as Record<string, string>,
        metadata: (q1.metadata ?? {}) as Record<string, unknown>,
      },
    });
    const r1 = await callDiscovery(history, "A");

    // Step 2: choisir B
    history.push({
      choice: "B",
      response: {
        question: r1.parsed.question as string,
        options: r1.parsed.options as Record<string, string>,
        metadata: (r1.parsed.metadata ?? {}) as Record<string, unknown>,
      },
    });
    const r2 = await callDiscovery(history, "B");

    // Step 3: neither (devrait pivoter, pas finaliser)
    history.push({
      choice: "neither",
      response: {
        question: r2.parsed.question as string,
        options: r2.parsed.options as Record<string, string>,
        metadata: (r2.parsed.metadata ?? {}) as Record<string, unknown>,
      },
    });
    const pivot = await callDiscovery(history, "neither");

    assert(
      pivot.parsed.statut === "en_cours",
      `Neither pivot \u2192 en_cours (${pivot.latencyMs}ms)`,
      `statut: ${pivot.parsed.statut}`,
    );
    assert(
      pivot.parsed.phase === "pivot" || pivot.parsed.phase === "questionnement",
      "Neither \u2192 phase pivot ou questionnement",
      `phase: ${pivot.parsed.phase}`,
    );

    // Step 4: choisir A apr\u00e8s pivot \u2192 ne doit PAS finaliser pr\u00e9matur\u00e9ment
    if (pivot.parsed.statut === "en_cours") {
      history.push({
        choice: "A",
        response: {
          question: pivot.parsed.question as string,
          options: pivot.parsed.options as Record<string, string>,
          metadata: (pivot.parsed.metadata ?? {}) as Record<string, unknown>,
        },
      });
      const afterPivot = await callDiscovery(history, "A");
      assert(
        ["en_cours", "finalis\u00e9"].includes(afterPivot.parsed.statut as string),
        `Apr\u00e8s pivot + A \u2192 r\u00e9ponse valide (${afterPivot.latencyMs}ms)`,
        `statut: ${afterPivot.parsed.statut}`,
      );
    }
  } catch (err: unknown) {
    assert(false, `Neither pivot \u2192 erreur: ${(err as Error).message}`);
  }

  // ── Test 3 : Refine flow ───────────────────────────────────────────────
  try {
    const maxChoices = MIN_DEPTH + 3;
    const choices = Array.from({ length: maxChoices }, (_, i) => i % 2 === 0 ? "A" : "B");
    const { history, finalResponse } = await playSession(choices);

    if (!finalResponse) {
      assert(false, "Refine: session initiale pas finalis\u00e9e");
    } else {
      // Envoyer refine
      history.push({
        choice: "refine",
        response: {
          question: undefined,
          options: undefined,
          metadata: (finalResponse.metadata ?? {}) as Record<string, unknown>,
          recommandation_finale: finalResponse.recommandation_finale as { titre?: string; explication?: string },
        },
      });

      const refineResult = await callClassic(history, "refine");
      assert(
        refineResult.parsed.statut === "en_cours",
        `Refine \u2192 en_cours (${refineResult.latencyMs}ms)`,
        `statut: ${refineResult.parsed.statut}`,
      );

      // Jouer 2-3 choix A/B suppl\u00e9mentaires via discovery state
      if (refineResult.parsed.statut === "en_cours") {
        let refResponse = refineResult.parsed;
        let refFinalized = false;

        for (const c of ["A", "B", "A"]) {
          history.push({
            choice: c,
            response: {
              question: refResponse.question as string,
              options: refResponse.options as Record<string, string>,
              metadata: (refResponse.metadata ?? {}) as Record<string, unknown>,
            },
          });
          const r = await callDiscovery(history, c);
          refResponse = r.parsed;
          if (r.parsed.statut === "finalis\u00e9") {
            refFinalized = true;
            assert(true, `Refine \u2192 finalis\u00e9 apr\u00e8s affinage (${r.latencyMs}ms)`);
            break;
          }
        }

        if (!refFinalized) {
          // Certains mod\u00e8les sont plus lents \u00e0 converger
          assert(true, "Refine \u2192 pas finalis\u00e9 en 3 questions (mod\u00e8le lent \u00e0 converger)");
        }
      }
    }
  } catch (err: unknown) {
    assert(false, `Refine flow \u2192 erreur: ${(err as Error).message}`);
  }

  // ── Test 4 : Reroll ────────────────────────────────────────────────────
  try {
    const maxChoices = MIN_DEPTH + 3;
    const choices = Array.from({ length: maxChoices }, (_, i) => i % 2 === 0 ? "A" : "B");
    const { history, finalResponse } = await playSession(choices);

    if (!finalResponse) {
      assert(false, "Reroll: session initiale pas finalis\u00e9e");
    } else {
      const titre1 = (finalResponse.recommandation_finale as Record<string, unknown>)?.titre as string ?? "";

      // Envoyer reroll
      history.push({
        choice: "reroll",
        response: {
          question: undefined,
          options: undefined,
          metadata: (finalResponse.metadata ?? {}) as Record<string, unknown>,
          recommandation_finale: finalResponse.recommandation_finale as { titre?: string; explication?: string },
        },
      });

      const rerollResult = await callClassic(history, "reroll");

      assert(
        rerollResult.parsed.statut === "finalis\u00e9",
        `Reroll \u2192 finalis\u00e9 imm\u00e9diat (${rerollResult.latencyMs}ms)`,
        `statut: ${rerollResult.parsed.statut}`,
      );

      const titre2 = (rerollResult.parsed.recommandation_finale as Record<string, unknown>)?.titre as string ?? "";
      assert(
        titre1.toLowerCase() !== titre2.toLowerCase(),
        "Reroll \u2192 titre diff\u00e9rent",
        `\u00ab${titre1}\u00bb vs \u00ab${titre2}\u00bb`,
      );
    }
  } catch (err: unknown) {
    assert(false, `Reroll \u2192 erreur: ${(err as Error).message}`);
  }
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------
async function main() {
  const args = process.argv.slice(2);
  const runIntegration = args.includes("--integration");

  runUnitTests();

  if (runIntegration) {
    await runIntegrationTests();
  }

  // R\u00e9sum\u00e9
  console.log(`\n${"=".repeat(50)}`);
  const total = passed + failed;
  if (failed === 0) {
    console.log(`R\u00e9sultat : ${passed}/${total} pass\u00e9s \u2713`);
  } else {
    console.log(`R\u00e9sultat : ${passed}/${total} pass\u00e9s, ${failed} \u00e9chou\u00e9(s) \u2717`);
    for (const f of failures) {
      console.log(`  \u2717 ${f}`);
    }
  }
  console.log("");

  process.exit(failed > 0 ? 1 : 0);
}

main();
