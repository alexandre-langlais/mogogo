#!/usr/bin/env npx tsx
/**
 * Tests unitaires pour la logique d'arbre du funnel V3.
 *
 * Couvre :
 *   - Phase 2 : Theme Engine (éligibilité, tirage, Q0 tags)
 *   - Phase 3 : Drill-Down state (home/outing, neither, backtrack, impasse)
 *   - Phase 3 : Pool logic (pool client-side, snapshots, strip)
 *   - Phase 4 : Fallbacks
 *   - Plumes : gate Phase 2
 *
 * Usage :
 *   npx tsx scripts/test-tree-logic.ts
 */

import {
  THEMES,
  getEligibleThemes,
  pickThemeDuel,
  getThemeByTags,
} from "../supabase/functions/_shared/theme-engine.ts";

import {
  buildDrillDownState,
  extractBranchPath,
  type DrillDownNode,
} from "../supabase/functions/_shared/drill-down-state.ts";

import {
  getPairFromPool,
  getEmojiPairFromPool,
  isPoolExhausted,
  stripPoolSnapshots,
  buildNodeWithSnapshot,
  restoreFromSnapshot,
  type DrillDownNodeWithPool,
  type PoolSnapshot,
} from "./lib/pool-logic.ts";

import type { LLMResponse } from "../src/types/index.ts";

// ---------------------------------------------------------------------------
// Test harness
// ---------------------------------------------------------------------------
let passed = 0;
let failed = 0;
const failures: string[] = [];

function assert(condition: boolean, label: string, detail?: string) {
  if (condition) {
    console.log(`  ✓ ${label}`);
    passed++;
  } else {
    const msg = detail ? `${label} — ${detail}` : label;
    console.log(`  ✗ ${msg}`);
    failed++;
    failures.push(msg);
  }
}

// ---------------------------------------------------------------------------
// Tests — Phase 2 : Theme Engine
// ---------------------------------------------------------------------------

function testThemeEngine() {
  console.log("\n═══ Tests Tree Logic — Phase 2 : Theme Engine ═══\n");

  // ── Éligibilité env_home ────────────────────────────────────────────
  console.log("  — Éligibilité env_home —");
  {
    const eligible = getEligibleThemes({ environment: "env_home" });
    const slugs = eligible.map((t) => t.slug);

    assert(!slugs.includes("nature"), "env_home → nature exclu");
    assert(!slugs.includes("voyage"), "env_home → voyage exclu");
    assert(slugs.includes("sport"), "env_home → sport inclus");
    assert(slugs.includes("culture"), "env_home → culture inclus");
    assert(slugs.includes("gastronomie"), "env_home → gastronomie inclus");
    assert(slugs.includes("detente"), "env_home → detente inclus");
    assert(slugs.includes("fete"), "env_home → fete inclus");
    assert(slugs.includes("creatif"), "env_home → creatif inclus");
    assert(slugs.includes("jeux"), "env_home → jeux inclus");
    assert(slugs.includes("musique"), "env_home → musique inclus");
    assert(slugs.includes("cinema"), "env_home → cinema inclus");
    assert(slugs.includes("tech"), "env_home → tech inclus");
    assert(slugs.includes("social"), "env_home → social inclus");
    assert(slugs.includes("insolite"), "env_home → insolite inclus");
    assert(eligible.length === 12, `env_home → 12 thèmes éligibles (obtenu: ${eligible.length})`);
  }

  // ── Éligibilité env_shelter ─────────────────────────────────────────
  console.log("\n  — Éligibilité env_shelter —");
  {
    const eligible = getEligibleThemes({ environment: "env_shelter" });
    const slugs = eligible.map((t) => t.slug);

    assert(!slugs.includes("nature"), "env_shelter → nature exclu");
    assert(slugs.includes("sport"), "env_shelter → sport inclus");
    assert(slugs.includes("culture"), "env_shelter → culture inclus");
    assert(slugs.includes("gastronomie"), "env_shelter → gastronomie inclus");
    assert(slugs.includes("detente"), "env_shelter → detente inclus");
    assert(slugs.includes("fete"), "env_shelter → fete inclus");
    assert(slugs.includes("creatif"), "env_shelter → creatif inclus");
    assert(slugs.includes("jeux"), "env_shelter → jeux inclus");
    assert(slugs.includes("musique"), "env_shelter → musique inclus");
    assert(slugs.includes("cinema"), "env_shelter → cinema inclus");
    assert(slugs.includes("voyage"), "env_shelter → voyage inclus");
    assert(slugs.includes("tech"), "env_shelter → tech inclus");
    assert(slugs.includes("social"), "env_shelter → social inclus");
    assert(slugs.includes("insolite"), "env_shelter → insolite inclus");
    assert(eligible.length === 13, `env_shelter → 13 thèmes éligibles (obtenu: ${eligible.length})`);
  }

  // ── Éligibilité env_open_air ────────────────────────────────────────
  console.log("\n  — Éligibilité env_open_air —");
  {
    const eligible = getEligibleThemes({ environment: "env_open_air" });
    const slugs = eligible.map((t) => t.slug);

    assert(slugs.includes("sport"), "env_open_air → sport inclus");
    assert(slugs.includes("culture"), "env_open_air → culture inclus");
    assert(slugs.includes("gastronomie"), "env_open_air → gastronomie inclus");
    assert(slugs.includes("nature"), "env_open_air → nature inclus");
    assert(slugs.includes("detente"), "env_open_air → detente inclus");
    assert(slugs.includes("fete"), "env_open_air → fete inclus");
    assert(slugs.includes("creatif"), "env_open_air → creatif inclus");
    assert(slugs.includes("jeux"), "env_open_air → jeux inclus");
    assert(slugs.includes("musique"), "env_open_air → musique inclus");
    assert(!slugs.includes("cinema"), "env_open_air → cinema exclu");
    assert(slugs.includes("voyage"), "env_open_air → voyage inclus");
    assert(slugs.includes("tech"), "env_open_air → tech inclus");
    assert(slugs.includes("social"), "env_open_air → social inclus");
    assert(slugs.includes("insolite"), "env_open_air → insolite inclus");
    assert(eligible.length === 13, `env_open_air → 13 thèmes éligibles (obtenu: ${eligible.length})`);
  }

  // ── Tirage aléatoire ────────────────────────────────────────────────
  console.log("\n  — Tirage aléatoire —");
  {
    const eligible = getEligibleThemes({ environment: "env_shelter" });

    const [a, b] = pickThemeDuel(eligible);
    assert(a.slug !== b.slug, "Duel → 2 thèmes différents");
    assert(eligible.some((t) => t.slug === a.slug), "ThèmeA dans le pool éligible");
    assert(eligible.some((t) => t.slug === b.slug), "ThèmeB dans le pool éligible");

    // Variété sur 20 runs
    const seen = new Set<string>();
    for (let i = 0; i < 20; i++) {
      const [x, y] = pickThemeDuel(eligible);
      seen.add(x.slug);
      seen.add(y.slug);
    }
    assert(seen.size >= 3, `Variété sur 20 tirages → ${seen.size} thèmes uniques (≥3 attendu)`);
  }

  // ── Q0 avec tags ────────────────────────────────────────────────────
  console.log("\n  — Q0 avec tags —");
  {
    const result = getThemeByTags(["sport"]);
    assert(result !== null, "Tag 'sport' → thème trouvé");
    assert(result?.slug === "sport", "Tag 'sport' → slug sport", `obtenu: ${result?.slug}`);
  }

  {
    const result = getThemeByTags(["social", "culture"]);
    assert(result !== null, "Tags multiples → premier trouvé");
    assert(
      result?.slug === "social" || result?.slug === "culture",
      "Premier tag correspondant retourné",
      `obtenu: ${result?.slug}`,
    );
  }

  {
    const result = getThemeByTags(["inexistant"]);
    assert(result === null, "Tag inconnu → null");
  }

  {
    const result = getThemeByTags([]);
    assert(result === null, "Tags vide → null");
  }
}

// ---------------------------------------------------------------------------
// Tests — Phase 3 : Drill-Down
// ---------------------------------------------------------------------------

function testDrillDown() {
  console.log("\n═══ Tests Tree Logic — Phase 3 : Drill-Down ═══\n");

  // ── Mode HOME ───────────────────────────────────────────────────────
  console.log("  — Mode HOME —");
  {
    const state = buildDrillDownState({
      themeSlug: "jeux",
      isHome: true,
      history: [],
      choice: undefined,
    });
    assert(state.mode === "home", "isHome=true → mode home");
    assert(state.needsPlaces === false, "Mode home → pas besoin de places");
    assert(state.instruction.length > 0, "Instruction non vide");
  }

  // ── Mode OUTING ─────────────────────────────────────────────────────
  console.log("\n  — Mode OUTING —");
  {
    const state = buildDrillDownState({
      themeSlug: "social",
      isHome: false,
      history: [],
      choice: undefined,
    });
    assert(state.mode === "outing", "isHome=false → mode outing");
    assert(state.needsPlaces === true, "Mode outing → besoin de places");
  }

  // ── Profondeur tracking ─────────────────────────────────────────────
  console.log("\n  — Profondeur —");
  {
    const history: DrillDownNode[] = [
      { question: "Q1", optionA: "A1", optionB: "B1", choice: "A" },
      { question: "Q2", optionA: "A2", optionB: "B2", choice: "B" },
    ];
    const state = buildDrillDownState({
      themeSlug: "sport",
      isHome: false,
      history,
      choice: "A",
    });
    assert(state.depth === 3, "2 historique + choix courant → depth=3", `obtenu: ${state.depth}`);
  }

  // ── Neither → 2 alternatives ───────────────────────────────────────
  console.log("\n  — Neither —");
  {
    const history: DrillDownNode[] = [
      { question: "Q1", optionA: "A1", optionB: "B1", choice: "A" },
    ];
    const state = buildDrillDownState({
      themeSlug: "culture",
      isHome: false,
      history,
      choice: "neither",
    });
    assert(state.isNeither === true, "choice=neither → isNeither=true");
    assert(state.depth === 2, "neither → même profondeur que le parent + 1", `obtenu: ${state.depth}`);
    assert(
      state.instruction.includes("POOL_CLASSIFICATION"),
      "Instruction neither → POOL_CLASSIFICATION (fallback serveur)",
    );
  }

  // ── Backtracking auto (3x neither consécutifs) ──────────────────────
  console.log("\n  — Backtrack auto —");
  {
    const history: DrillDownNode[] = [
      { question: "Q1", optionA: "A1", optionB: "B1", choice: "A" },
      { question: "Q2", optionA: "A2", optionB: "B2", choice: "neither" },
      { question: "Q3", optionA: "A3", optionB: "B3", choice: "neither" },
    ];
    const state = buildDrillDownState({
      themeSlug: "sport",
      isHome: false,
      history,
      choice: "neither",
    });
    assert(state.shouldBacktrack === true, "3x neither → shouldBacktrack=true");
  }

  {
    // 2x neither → pas encore de backtrack
    const history: DrillDownNode[] = [
      { question: "Q1", optionA: "A1", optionB: "B1", choice: "A" },
      { question: "Q2", optionA: "A2", optionB: "B2", choice: "neither" },
    ];
    const state = buildDrillDownState({
      themeSlug: "sport",
      isHome: false,
      history,
      choice: "neither",
    });
    assert(state.shouldBacktrack === false, "2x neither → pas encore de backtrack");
  }

  // ── Impasse racine ──────────────────────────────────────────────────
  console.log("\n  — Impasse racine —");
  {
    // Historique vide + neither → impasse directe
    const state = buildDrillDownState({
      themeSlug: "sport",
      isHome: false,
      history: [],
      choice: "neither",
      consecutiveNeithers: 3,
    });
    assert(state.isImpasse === true, "Racine + 3 neithers → impasse");
  }

  // ── Branch Path + Current Category ────────────────────────────────
  console.log("\n  — Branch Path —");
  {
    // Premier appel : branchPath = [themeSlug]
    const state = buildDrillDownState({
      themeSlug: "sport",
      isHome: false,
      history: [],
      choice: undefined,
    });
    assert(
      JSON.stringify(state.branchPath) === JSON.stringify(["Sport"]),
      "Premier appel → branchPath = [theme.name]",
      `obtenu: ${JSON.stringify(state.branchPath)}`,
    );
    assert(state.currentCategory === "Sport", "Premier appel → currentCategory = theme.name");
  }

  {
    // Après un choix A : branchPath inclut l'option choisie
    const history: DrillDownNode[] = [
      { question: "Q1", optionA: "Sports d'eau", optionB: "Sports de balle", choice: "A" },
    ];
    const state = buildDrillDownState({
      themeSlug: "sport",
      isHome: false,
      history,
      choice: "B",
    });
    assert(
      JSON.stringify(state.branchPath) === JSON.stringify(["Sport", "Sports d'eau"]),
      "Choix A puis B → branchPath = [Sport, Sports d'eau]",
      `obtenu: ${JSON.stringify(state.branchPath)}`,
    );
    assert(state.currentCategory === "Sports d'eau", "currentCategory = dernier du path");
  }

  {
    // Neither ne pousse pas dans le path
    const history: DrillDownNode[] = [
      { question: "Q1", optionA: "Arts visuels", optionB: "Arts vivants", choice: "neither" },
    ];
    const path = extractBranchPath("culture", history);
    assert(
      JSON.stringify(path) === JSON.stringify(["Culture"]),
      "Neither ne pousse rien → path reste [theme.name]",
      `obtenu: ${JSON.stringify(path)}`,
    );
  }

  {
    // Profondeur multi-niveaux
    const history: DrillDownNode[] = [
      { question: "Q1", optionA: "Cuisine", optionB: "Restaurant", choice: "B" },
      { question: "Q2", optionA: "Italien", optionB: "Japonais", choice: "A" },
    ];
    const state = buildDrillDownState({
      themeSlug: "social",
      isHome: false,
      history,
      choice: "A",
    });
    assert(
      JSON.stringify(state.branchPath) === JSON.stringify(["Social", "Restaurant", "Italien"]),
      "Multi-niveaux → branchPath correct",
      `obtenu: ${JSON.stringify(state.branchPath)}`,
    );
    assert(state.currentCategory === "Italien", "currentCategory = dernier élément du path");
  }

  // ── mayFinalize ────────────────────────────────────────────────────
  console.log("\n  — mayFinalize (LLM décide) —");
  {
    // Avant minDepth : mayFinalize = false → le LLM ne peut PAS finaliser
    const history: DrillDownNode[] = [
      { question: "Q1", optionA: "A1", optionB: "B1", choice: "A" },
    ];
    const state = buildDrillDownState({
      themeSlug: "sport",
      isHome: false,
      history,
      choice: "B",
      minDepth: 4,
    });
    assert(state.mayFinalize === false, "depth < minDepth → mayFinalize=false");
    assert(
      !state.instruction.includes("finalisé"),
      "Instruction avant minDepth ne mentionne pas 'finalisé'",
    );
  }

  {
    // Après minDepth : mayFinalize = true → le LLM PEUT finaliser s'il le juge
    const history: DrillDownNode[] = [
      { question: "Q1", optionA: "A1", optionB: "B1", choice: "A" },
      { question: "Q2", optionA: "A2", optionB: "B2", choice: "B" },
      { question: "Q3", optionA: "A3", optionB: "B3", choice: "A" },
    ];
    const state = buildDrillDownState({
      themeSlug: "sport",
      isHome: false,
      history,
      choice: "B",
      minDepth: 3,
    });
    assert(state.mayFinalize === true, "depth >= minDepth → mayFinalize=true");
    assert(
      state.instruction.includes("finalisé"),
      "Instruction après minDepth mentionne possibilité de finaliser",
    );
  }

  // ── Instructions contiennent la catégorie courante ───────────────
  console.log("\n  — Instructions contextuelles —");
  {
    // Subdivision standard : mentionne la catégorie courante
    const history: DrillDownNode[] = [
      { question: "Q1", optionA: "Sports d'eau", optionB: "Sports de balle", choice: "A" },
    ];
    const state = buildDrillDownState({
      themeSlug: "sport",
      isHome: false,
      history,
      choice: "A",
      minDepth: 5,
    });
    assert(
      state.instruction.includes("Sports d'eau"),
      "Instruction POOL_CLASSIFICATION mentionne la sous-catégorie choisie",
    );
  }

  {
    // Neither mentionne la catégorie courante + OBLIGATOIREMENT
    const history: DrillDownNode[] = [
      { question: "Q1", optionA: "Sports d'eau", optionB: "Sports de balle", choice: "A" },
    ];
    const state = buildDrillDownState({
      themeSlug: "sport",
      isHome: false,
      history,
      choice: "neither",
    });
    assert(
      state.instruction.includes("Sports d'eau"),
      "Instruction POOL_CLASSIFICATION neither mentionne la catégorie courante",
    );
    assert(
      state.instruction.includes("OBLIGATOIREMENT"),
      "Instruction POOL_CLASSIFICATION neither insiste sur rester dans la catégorie",
    );
  }

  {
    // Premier appel : mentionne le thème racine
    const state = buildDrillDownState({
      themeSlug: "jeux",
      isHome: true,
      history: [],
      choice: undefined,
    });
    assert(
      state.instruction.includes("Jeux"),
      "Instruction POOL_CLASSIFICATION mentionne le thème racine (nom descriptif)",
    );
  }

  // ── Convergence (mayFinalize / willFinalize) ────────────────────────
  console.log("\n  — Convergence —");
  {
    const history: DrillDownNode[] = [
      { question: "Q1", optionA: "A1", optionB: "B1", choice: "A" },
      { question: "Q2", optionA: "A2", optionB: "B2", choice: "B" },
      { question: "Q3", optionA: "A3", optionB: "B3", choice: "A" },
    ];
    const state = buildDrillDownState({
      themeSlug: "social",
      isHome: false,
      history,
      choice: "B",
      minDepth: 4,
    });
    assert(state.mayFinalize === true, "depth >= minDepth → mayFinalize=true");
    assert(state.willFinalize === true, "depth >= minDepth → willFinalize=true (alias)");
  }

  {
    const history: DrillDownNode[] = [
      { question: "Q1", optionA: "A1", optionB: "B1", choice: "A" },
    ];
    const state = buildDrillDownState({
      themeSlug: "social",
      isHome: false,
      history,
      choice: "B",
      minDepth: 4,
    });
    assert(state.mayFinalize === false, "depth < minDepth → mayFinalize=false");
    assert(state.willFinalize === false, "depth < minDepth → willFinalize=false (alias)");
  }

  {
    // neither + depth >= minDepth → mayFinalize=false (neither ne peut pas finaliser)
    const history: DrillDownNode[] = [
      { question: "Q1", optionA: "A1", optionB: "B1", choice: "A" },
      { question: "Q2", optionA: "A2", optionB: "B2", choice: "A" },
      { question: "Q3", optionA: "A3", optionB: "B3", choice: "A" },
    ];
    const state = buildDrillDownState({
      themeSlug: "social",
      isHome: false,
      history,
      choice: "neither",
      minDepth: 3,
    });
    assert(state.mayFinalize === false, "neither + depth >= minDepth → mayFinalize=false");
  }

  {
    // Défaut minDepth = 3
    const history: DrillDownNode[] = [
      { question: "Q1", optionA: "A1", optionB: "B1", choice: "A" },
      { question: "Q2", optionA: "A2", optionB: "B2", choice: "B" },
    ];
    const state = buildDrillDownState({
      themeSlug: "social",
      isHome: false,
      history,
      choice: "A",
    });
    assert(state.mayFinalize === true, "défaut minDepth=3, depth=3 → mayFinalize=true");
  }
}

// ---------------------------------------------------------------------------
// Tests — Phase 4 : Fallbacks
// ---------------------------------------------------------------------------

function testFallbacks() {
  console.log("\n═══ Tests Tree Logic — Phase 4 : Fallbacks ═══\n");

  // Les fallbacks sont des flags dans le drill-down state
  {
    const state = buildDrillDownState({
      themeSlug: "nature",
      isHome: false,
      history: [],
      choice: undefined,
      availablePlacesCount: 0,
    });
    assert(
      state.fallbackLevel === 1,
      "0 places disponibles → fallbackLevel=1 (étendre rayon)",
      `obtenu: ${state.fallbackLevel}`,
    );
  }

  {
    const state = buildDrillDownState({
      themeSlug: "nature",
      isHome: false,
      history: [],
      choice: undefined,
      availablePlacesCount: 0,
      radiusMaxReached: true,
    });
    assert(
      state.fallbackLevel === 2,
      "0 places + rayon max → fallbackLevel=2 (mode HOME)",
      `obtenu: ${state.fallbackLevel}`,
    );
  }

  {
    const state = buildDrillDownState({
      themeSlug: "nature",
      isHome: false,
      history: [],
      choice: undefined,
      availablePlacesCount: 0,
      radiusMaxReached: true,
      homeAlreadyTried: true,
    });
    assert(
      state.fallbackLevel === 3,
      "0 places + rayon max + home essayé → fallbackLevel=3 (best guess)",
      `obtenu: ${state.fallbackLevel}`,
    );
  }

  {
    const state = buildDrillDownState({
      themeSlug: "nature",
      isHome: false,
      history: [],
      choice: undefined,
      availablePlacesCount: 5,
    });
    assert(
      state.fallbackLevel === 0,
      "5 places disponibles → fallbackLevel=0 (pas de fallback)",
      `obtenu: ${state.fallbackLevel}`,
    );
  }
}

// ---------------------------------------------------------------------------
// Tests — Plumes : Gate Phase 2
// ---------------------------------------------------------------------------

function testPlumesGate() {
  console.log("\n═══ Tests Tree Logic — Plumes Gate ═══\n");

  // Note: la logique de plumes gate est implémentée dans le llm-gateway,
  // ici on teste juste que le theme engine ne bloque pas les flux.

  {
    const eligible = getEligibleThemes({ environment: "env_shelter" });
    assert(eligible.length > 0, "Plumes : thèmes éligibles non vides");

    const [a, b] = pickThemeDuel(eligible);
    assert(!!a && !!b, "Plumes : duel de thèmes possible");
  }
}

// ---------------------------------------------------------------------------
// Tests — Phase 3 : Pool Instructions Serveur
// ---------------------------------------------------------------------------

function testPoolInstructions() {
  console.log("\n═══ Tests Tree Logic — Phase 3 : Pool Instructions Serveur ═══\n");

  // ── POOL_CLASSIFICATION au premier appel ─────────────────────────
  console.log("  — Pool instructions —");
  {
    const state = buildDrillDownState({
      themeSlug: "sport",
      isHome: false,
      history: [],
      choice: undefined,
    });
    assert(
      state.instruction.includes("POOL_CLASSIFICATION"),
      "Premier appel → instruction POOL_CLASSIFICATION",
      `obtenu: ${state.instruction.slice(0, 80)}`,
    );
    assert(
      state.instruction.includes("subcategories") || state.instruction.includes("sous-catégories"),
      "Instruction premier appel mentionne les sous-catégories",
    );
    assert(
      state.instruction.includes("4") && state.instruction.includes("8"),
      "Instruction mentionne '4' et '8' (taille du pool)",
    );
  }

  {
    // POOL_CLASSIFICATION après choix A/B
    const history: DrillDownNode[] = [
      { question: "Q1", optionA: "Sports d'eau", optionB: "Sports de balle", choice: "A" },
    ];
    const state = buildDrillDownState({
      themeSlug: "sport",
      isHome: false,
      history,
      choice: "A",
      minDepth: 5,
    });
    assert(
      state.instruction.includes("POOL_CLASSIFICATION"),
      "Choix A/B → instruction POOL_CLASSIFICATION",
      `obtenu: ${state.instruction.slice(0, 80)}`,
    );
  }

  {
    // mayFinalize + POOL_CLASSIFICATION permet aussi finalisation
    const history: DrillDownNode[] = [
      { question: "Q1", optionA: "A1", optionB: "B1", choice: "A" },
      { question: "Q2", optionA: "A2", optionB: "B2", choice: "B" },
      { question: "Q3", optionA: "A3", optionB: "B3", choice: "A" },
    ];
    const state = buildDrillDownState({
      themeSlug: "sport",
      isHome: false,
      history,
      choice: "B",
      minDepth: 3,
    });
    assert(
      state.instruction.includes("POOL_CLASSIFICATION"),
      "mayFinalize → instruction reste POOL_CLASSIFICATION",
    );
    assert(
      state.instruction.includes("finalisé"),
      "mayFinalize → instruction mentionne possibilité de finaliser",
    );
  }

  {
    // IMPASSE inchangée
    const state = buildDrillDownState({
      themeSlug: "sport",
      isHome: false,
      history: [],
      choice: "neither",
      consecutiveNeithers: 3,
    });
    assert(
      state.instruction.includes("IMPASSE"),
      "Impasse → instruction IMPASSE inchangée",
    );
  }

  {
    // BACKTRACK inchangé
    const history: DrillDownNode[] = [
      { question: "Q1", optionA: "A1", optionB: "B1", choice: "A" },
      { question: "Q2", optionA: "A2", optionB: "B2", choice: "neither" },
      { question: "Q3", optionA: "A3", optionB: "B3", choice: "neither" },
    ];
    const state = buildDrillDownState({
      themeSlug: "sport",
      isHome: false,
      history,
      choice: "neither",
    });
    assert(
      state.instruction.includes("BACKTRACK"),
      "Backtrack → instruction BACKTRACK inchangée",
    );
  }

  {
    // neither → plus d'instruction ALTERNATIVE (géré côté client)
    const history: DrillDownNode[] = [
      { question: "Q1", optionA: "A1", optionB: "B1", choice: "A" },
    ];
    const state = buildDrillDownState({
      themeSlug: "sport",
      isHome: false,
      history,
      choice: "neither",
    });
    assert(
      !state.instruction.includes("ALTERNATIVE"),
      "neither simple → plus d'instruction ALTERNATIVE (pool client)",
    );
    assert(
      state.instruction.includes("POOL_CLASSIFICATION"),
      "neither simple → instruction POOL_CLASSIFICATION (fallback serveur)",
    );
  }

  // ── FORCE_FINALIZE ("J'ai de la chance") ─────────────────────────
  console.log("\n  — Force Finalize —");
  {
    const history: DrillDownNode[] = [
      { question: "Q1", optionA: "A1", optionB: "B1", choice: "A" },
      { question: "Q2", optionA: "A2", optionB: "B2", choice: "B" },
      { question: "Q3", optionA: "A3", optionB: "B3", choice: "A" },
    ];
    const state = buildDrillDownState({
      themeSlug: "sport",
      isHome: false,
      history,
      choice: "A",
      forceFinalize: true,
    });
    assert(
      state.instruction.includes("FORCE_FINALIZE"),
      "forceFinalize=true → instruction FORCE_FINALIZE",
      `obtenu: ${state.instruction.slice(0, 80)}`,
    );
    assert(
      state.instruction.includes("finalisé"),
      "FORCE_FINALIZE mentionne statut finalisé",
    );
    assert(
      state.instruction.includes("A3"),
      "FORCE_FINALIZE mentionne la catégorie courante (path)",
      `obtenu: ${state.instruction.slice(0, 120)}`,
    );
    assert(
      state.willFinalize === true,
      "forceFinalize → willFinalize=true",
    );
  }

  {
    // forceFinalize même avant minDepth → quand même FORCE_FINALIZE
    const history: DrillDownNode[] = [
      { question: "Q1", optionA: "A1", optionB: "B1", choice: "A" },
    ];
    const state = buildDrillDownState({
      themeSlug: "sport",
      isHome: false,
      history,
      choice: "B",
      minDepth: 10,
      forceFinalize: true,
    });
    assert(
      state.instruction.includes("FORCE_FINALIZE"),
      "forceFinalize avant minDepth → quand même FORCE_FINALIZE",
    );
    assert(
      state.mayFinalize === true,
      "forceFinalize → mayFinalize=true même avant minDepth",
    );
  }
}

// ---------------------------------------------------------------------------
// Tests — Phase 3 : Pool Client Logic
// ---------------------------------------------------------------------------

function testPoolClientLogic() {
  console.log("\n═══ Tests Tree Logic — Phase 3 : Pool Client Logic ═══\n");

  const samplePool = ["Sports d'eau", "Sports de balle", "Sports de combat", "Sports de raquette", "Sports extrêmes"];
  const samplePoolEven = ["A", "B", "C", "D", "E", "F"];

  // ── getPairFromPool ───────────────────────────────────────────────
  console.log("  — getPairFromPool —");
  {
    const [a, b] = getPairFromPool(samplePool, 0);
    assert(a === "Sports d'eau", "pool[0] → A = Sports d'eau", `obtenu: ${a}`);
    assert(b === "Sports de balle", "pool[0] → B = Sports de balle", `obtenu: ${b}`);
  }

  {
    const [a, b] = getPairFromPool(samplePool, 2);
    assert(a === "Sports de combat", "pool[2] → A = Sports de combat", `obtenu: ${a}`);
    assert(b === "Sports de raquette", "pool[2] → B = Sports de raquette", `obtenu: ${b}`);
  }

  {
    // Pool impair, dernier élément solo
    const [a, b] = getPairFromPool(samplePool, 4);
    assert(a === "Sports extrêmes", "pool impair [4] → A = Sports extrêmes (solo)", `obtenu: ${a}`);
    assert(b === null, "pool impair [4] → B = null (solo)", `obtenu: ${b}`);
  }

  {
    // Pool épuisé
    const [a, b] = getPairFromPool(samplePoolEven, 6);
    assert(a === null, "pool épuisé → A = null", `obtenu: ${a}`);
    assert(b === null, "pool épuisé → B = null", `obtenu: ${b}`);
  }

  // ── isPoolExhausted ───────────────────────────────────────────────
  console.log("\n  — isPoolExhausted —");
  {
    assert(isPoolExhausted(samplePool, 0) === false, "pool[0] → pas épuisé");
    assert(isPoolExhausted(samplePool, 4) === false, "pool impair [4] → pas épuisé (solo restant)");
    assert(isPoolExhausted(samplePool, 5) === true, "pool[5] → épuisé");
    assert(isPoolExhausted(samplePoolEven, 6) === true, "pool pair [6] → épuisé");
    assert(isPoolExhausted([], 0) === true, "pool vide → épuisé immédiatement");
  }

  // ── Pool edge cases ───────────────────────────────────────────────
  console.log("\n  — Pool edge cases —");
  {
    // Pool 1 élément → solo dès le départ
    const [a, b] = getPairFromPool(["Seul"], 0);
    assert(a === "Seul", "pool 1 élément → A = Seul", `obtenu: ${a}`);
    assert(b === null, "pool 1 élément → B = null", `obtenu: ${b}`);
    assert(isPoolExhausted(["Seul"], 0) === false, "pool 1 élément → pas épuisé à idx 0");
    assert(isPoolExhausted(["Seul"], 1) === true, "pool 1 élément → épuisé à idx 1");
  }

  {
    // Pool 2 éléments → 1 paire, puis épuisé
    const pool2 = ["X", "Y"];
    const [a, b] = getPairFromPool(pool2, 0);
    assert(a === "X" && b === "Y", "pool 2 éléments → paire [X, Y]");
    assert(isPoolExhausted(pool2, 2) === true, "pool 2 éléments → épuisé après paire");
  }

  // ── stripPoolSnapshots ────────────────────────────────────────────
  console.log("\n  — stripPoolSnapshots —");
  {
    const fakeResponse: LLMResponse = {
      statut: "en_cours",
      phase: "questionnement",
      mogogo_message: "test",
      question: "test?",
      options: { A: "A", B: "B" },
      metadata: { pivot_count: 0, current_branch: "test", depth: 1 },
    };

    const nodes: DrillDownNodeWithPool[] = [
      {
        question: "Q1", optionA: "A1", optionB: "B1", choice: "A",
        poolSnapshot: { pool: samplePool, emojis: samplePool.map(() => "🔮"), poolIndex: 0, response: fakeResponse },
      },
      { question: "Q2", optionA: "A2", optionB: "B2", choice: "B" },
    ];

    const stripped = stripPoolSnapshots(nodes);
    assert(stripped.length === 2, "stripPoolSnapshots → même nombre de nodes");
    assert(!("poolSnapshot" in stripped[0]), "stripPoolSnapshots → pas de poolSnapshot dans node[0]");
    assert(!("poolSnapshot" in stripped[1]), "stripPoolSnapshots → pas de poolSnapshot dans node[1]");
    assert(stripped[0].optionA === "A1", "stripPoolSnapshots → données préservées");
  }

  // ── buildNodeWithSnapshot ─────────────────────────────────────────
  console.log("\n  — buildNodeWithSnapshot —");
  {
    const fakeResponse: LLMResponse = {
      statut: "en_cours",
      phase: "questionnement",
      mogogo_message: "Quel sport ?",
      question: "Quel type de sport ?",
      options: { A: "Sports d'eau", B: "Sports de balle" },
      metadata: { pivot_count: 0, current_branch: "sport", depth: 1 },
    };

    const node = buildNodeWithSnapshot(
      "Sports d'eau", "Sports de balle", "A",
      samplePool, 0, fakeResponse, "Quel type de sport ?",
    );

    assert(node.optionA === "Sports d'eau", "buildNode → optionA correcte");
    assert(node.optionB === "Sports de balle", "buildNode → optionB correcte");
    assert(node.choice === "A", "buildNode → choice correcte");
    assert(node.question === "Quel type de sport ?", "buildNode → question correcte");
    assert(node.poolSnapshot !== undefined, "buildNode → poolSnapshot présent");
    assert(node.poolSnapshot!.pool === samplePool, "buildNode → pool référencé");
    assert(node.poolSnapshot!.poolIndex === 0, "buildNode → poolIndex correct");
    assert(node.poolSnapshot!.response === fakeResponse, "buildNode → response référencée");
  }

  // ── restoreFromSnapshot ───────────────────────────────────────────
  console.log("\n  — restoreFromSnapshot —");
  {
    const fakeResponse: LLMResponse = {
      statut: "en_cours",
      phase: "questionnement",
      mogogo_message: "Quel sport ?",
      question: "Quel type de sport ?",
      options: { A: "Sports d'eau", B: "Sports de balle" },
      metadata: { pivot_count: 0, current_branch: "sport", depth: 1 },
    };

    const nodeWith: DrillDownNodeWithPool = {
      question: "Q1", optionA: "Sports d'eau", optionB: "Sports de balle", choice: "A",
      poolSnapshot: { pool: samplePool, emojis: samplePool.map(() => "🔮"), poolIndex: 2, response: fakeResponse },
    };

    const restored = restoreFromSnapshot(nodeWith);
    assert(restored !== null, "restoreFromSnapshot → non null");
    assert(restored!.pool === samplePool, "restoreFromSnapshot → pool correct");
    assert(restored!.poolIndex === 2, "restoreFromSnapshot → poolIndex correct");
    assert(restored!.response === fakeResponse, "restoreFromSnapshot → response correcte");
  }

  {
    // Node sans snapshot → null
    const nodeWithout: DrillDownNodeWithPool = {
      question: "Q1", optionA: "A1", optionB: "B1", choice: "B",
    };
    const restored = restoreFromSnapshot(nodeWithout);
    assert(restored === null, "restoreFromSnapshot sans snapshot → null");
  }

  // ── getEmojiPairFromPool ──────────────────────────────────────────
  console.log("\n  — getEmojiPairFromPool —");
  {
    const emojis = ["🎮", "🎲", "🏃", "🎭", "🎵"];

    const [a, b] = getEmojiPairFromPool(emojis, 0);
    assert(a === "🎮", "emojis[0] → A = 🎮", `obtenu: ${a}`);
    assert(b === "🎲", "emojis[0] → B = 🎲", `obtenu: ${b}`);
  }

  {
    const emojis = ["🎮", "🎲", "🏃", "🎭", "🎵"];
    const [a, b] = getEmojiPairFromPool(emojis, 2);
    assert(a === "🏃", "emojis[2] → A = 🏃", `obtenu: ${a}`);
    assert(b === "🎭", "emojis[2] → B = 🎭", `obtenu: ${b}`);
  }

  {
    // Pool impair, dernier emoji solo → fallback pour B
    const emojis = ["🎮", "🎲", "🏃", "🎭", "🎵"];
    const [a, b] = getEmojiPairFromPool(emojis, 4);
    assert(a === "🎵", "emojis impair [4] → A = 🎵 (solo)", `obtenu: ${a}`);
    assert(b === "🔮", "emojis impair [4] → B = 🔮 (fallback)", `obtenu: ${b}`);
  }

  {
    // Pool épuisé → double fallback
    const emojis = ["🎮", "🎲"];
    const [a, b] = getEmojiPairFromPool(emojis, 4);
    assert(a === "🔮", "emojis épuisé → A = 🔮 (fallback)", `obtenu: ${a}`);
    assert(b === "🔮", "emojis épuisé → B = 🔮 (fallback)", `obtenu: ${b}`);
  }

  {
    // Tableau vide → double fallback
    const [a, b] = getEmojiPairFromPool([], 0);
    assert(a === "🔮", "emojis vide → A = 🔮", `obtenu: ${a}`);
    assert(b === "🔮", "emojis vide → B = 🔮", `obtenu: ${b}`);
  }

  // ── buildNodeWithSnapshot avec emojis ─────────────────────────────
  console.log("\n  — buildNodeWithSnapshot avec emojis —");
  {
    const fakeResponse: LLMResponse = {
      statut: "en_cours",
      phase: "questionnement",
      mogogo_message: "Quel sport ?",
      question: "Quel type de sport ?",
      options: { A: "Sports d'eau", B: "Sports de balle" },
      metadata: { pivot_count: 0, current_branch: "sport", depth: 1 },
    };

    const emojis = ["🏊", "⚽", "🥊", "🎾", "🪂"];
    const node = buildNodeWithSnapshot(
      "Sports d'eau", "Sports de balle", "A",
      samplePool, 0, fakeResponse, "Quel type de sport ?",
      emojis,
    );

    assert(node.poolSnapshot !== undefined, "buildNode avec emojis → poolSnapshot présent");
    assert(
      JSON.stringify(node.poolSnapshot!.emojis) === JSON.stringify(emojis),
      "buildNode avec emojis → emojis stockés dans snapshot",
      `obtenu: ${JSON.stringify(node.poolSnapshot!.emojis)}`,
    );
  }

  {
    // Sans emojis → fallback 🔮 pour chaque élément du pool
    const fakeResponse: LLMResponse = {
      statut: "en_cours",
      phase: "questionnement",
      mogogo_message: "test",
      question: "test?",
      options: { A: "A", B: "B" },
      metadata: { pivot_count: 0, current_branch: "test", depth: 1 },
    };

    const node = buildNodeWithSnapshot(
      "A", "B", "A",
      samplePool, 0, fakeResponse, "test?",
    );

    assert(
      node.poolSnapshot!.emojis.length === samplePool.length,
      "buildNode sans emojis → fallback emojis même taille que pool",
      `obtenu: ${node.poolSnapshot!.emojis.length} vs ${samplePool.length}`,
    );
    assert(
      node.poolSnapshot!.emojis.every(e => e === "🔮"),
      "buildNode sans emojis → tous les emojis sont 🔮",
    );
  }

  // ── restoreFromSnapshot préserve les emojis ───────────────────────
  console.log("\n  — restoreFromSnapshot préserve les emojis —");
  {
    const fakeResponse: LLMResponse = {
      statut: "en_cours",
      phase: "questionnement",
      mogogo_message: "test",
      question: "test?",
      options: { A: "A", B: "B" },
      metadata: { pivot_count: 0, current_branch: "test", depth: 1 },
    };

    const emojis = ["🎮", "🎲", "🏃"];
    const nodeWith: DrillDownNodeWithPool = {
      question: "Q1", optionA: "A1", optionB: "B1", choice: "A",
      poolSnapshot: { pool: ["X", "Y", "Z"], emojis, poolIndex: 2, response: fakeResponse },
    };

    const restored = restoreFromSnapshot(nodeWith);
    assert(restored !== null, "restoreFromSnapshot avec emojis → non null");
    assert(
      JSON.stringify(restored!.emojis) === JSON.stringify(emojis),
      "restoreFromSnapshot → emojis préservés",
      `obtenu: ${JSON.stringify(restored!.emojis)}`,
    );
  }
}

// ---------------------------------------------------------------------------
// All tests
// ---------------------------------------------------------------------------

function runTests() {
  testThemeEngine();
  testDrillDown();
  testPoolInstructions();
  testPoolClientLogic();
  testFallbacks();
  testPlumesGate();

  // ── Résumé ──────────────────────────────────────────────────────────
  console.log(`\n${"═".repeat(50)}`);
  console.log(`  Tree Logic : ${passed} passed, ${failed} failed`);
  if (failures.length > 0) {
    console.log("\n  Échecs :");
    failures.forEach((f) => console.log(`    • ${f}`));
  }
  console.log();

  process.exit(failed > 0 ? 1 : 0);
}

runTests();
