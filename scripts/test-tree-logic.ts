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
  buildDrillDownMessages,
} from "../supabase/functions/_shared/system-prompts-v3.ts";

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

    assert(slugs.includes("nature_adventure"), "env_home → nature_adventure inclus");
    assert(slugs.includes("story_screen"), "env_home → story_screen inclus");
    assert(slugs.includes("calm_escape"), "env_home → calm_escape inclus");
    assert(slugs.includes("music_crea"), "env_home → music_crea inclus");
    assert(slugs.includes("move_sport"), "env_home → move_sport inclus");
    assert(slugs.includes("food_drink"), "env_home → food_drink inclus");
    assert(slugs.includes("culture_knowledge"), "env_home → culture_knowledge inclus");
    assert(slugs.includes("social_fun"), "env_home → social_fun inclus");
    assert(eligible.length === 8, `env_home → 8 thèmes éligibles (obtenu: ${eligible.length})`);
  }

  // ── Éligibilité env_shelter ─────────────────────────────────────────
  console.log("\n  — Éligibilité env_shelter —");
  {
    const eligible = getEligibleThemes({ environment: "env_shelter" });
    const slugs = eligible.map((t) => t.slug);

    assert(slugs.includes("nature_adventure"), "env_shelter → nature_adventure inclus");
    assert(slugs.includes("story_screen"), "env_shelter → story_screen inclus");
    assert(slugs.includes("calm_escape"), "env_shelter → calm_escape inclus");
    assert(slugs.includes("music_crea"), "env_shelter → music_crea inclus");
    assert(slugs.includes("move_sport"), "env_shelter → move_sport inclus");
    assert(slugs.includes("food_drink"), "env_shelter → food_drink inclus");
    assert(slugs.includes("culture_knowledge"), "env_shelter → culture_knowledge inclus");
    assert(slugs.includes("social_fun"), "env_shelter → social_fun inclus");
    assert(eligible.length === 8, `env_shelter → 8 thèmes éligibles (obtenu: ${eligible.length})`);
  }

  // ── Éligibilité env_open_air ────────────────────────────────────────
  console.log("\n  — Éligibilité env_open_air —");
  {
    const eligible = getEligibleThemes({ environment: "env_open_air" });
    const slugs = eligible.map((t) => t.slug);

    assert(slugs.includes("story_screen"), "env_open_air → story_screen inclus");
    assert(slugs.includes("calm_escape"), "env_open_air → calm_escape inclus");
    assert(slugs.includes("music_crea"), "env_open_air → music_crea inclus");
    assert(slugs.includes("move_sport"), "env_open_air → move_sport inclus");
    assert(slugs.includes("nature_adventure"), "env_open_air → nature_adventure inclus");
    assert(slugs.includes("food_drink"), "env_open_air → food_drink inclus");
    assert(slugs.includes("culture_knowledge"), "env_open_air → culture_knowledge inclus");
    assert(slugs.includes("social_fun"), "env_open_air → social_fun inclus");
    assert(eligible.length === 8, `env_open_air → 8 thèmes éligibles (obtenu: ${eligible.length})`);
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
    const result = getThemeByTags(["move_sport"]);
    assert(result !== null, "Tag 'move_sport' → thème trouvé");
    assert(result?.slug === "move_sport", "Tag 'move_sport' → slug move_sport", `obtenu: ${result?.slug}`);
  }

  {
    const result = getThemeByTags(["social_fun", "culture_knowledge"]);
    assert(result !== null, "Tags multiples → premier trouvé");
    assert(
      result?.slug === "social_fun" || result?.slug === "culture_knowledge",
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
      themeSlug: "social_fun",
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
      themeSlug: "social_fun",
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
      themeSlug: "move_sport",
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
      themeSlug: "culture_knowledge",
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
      themeSlug: "move_sport",
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
      themeSlug: "move_sport",
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
      themeSlug: "move_sport",
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
      themeSlug: "move_sport",
      isHome: false,
      history: [],
      choice: undefined,
    });
    assert(
      JSON.stringify(state.branchPath) === JSON.stringify(["Mouvement & Sport"]),
      "Premier appel → branchPath = [theme.name]",
      `obtenu: ${JSON.stringify(state.branchPath)}`,
    );
    assert(state.currentCategory === "Mouvement & Sport", "Premier appel → currentCategory = theme.name");
  }

  {
    // Après un choix A : branchPath inclut l'option choisie
    const history: DrillDownNode[] = [
      { question: "Q1", optionA: "Sports d'eau", optionB: "Sports de balle", choice: "A" },
    ];
    const state = buildDrillDownState({
      themeSlug: "move_sport",
      isHome: false,
      history,
      choice: "B",
    });
    assert(
      JSON.stringify(state.branchPath) === JSON.stringify(["Mouvement & Sport", "Sports d'eau"]),
      "Choix A puis B → branchPath = [Mouvement & Sport, Sports d'eau]",
      `obtenu: ${JSON.stringify(state.branchPath)}`,
    );
    assert(state.currentCategory === "Sports d'eau", "currentCategory = dernier du path");
  }

  {
    // Neither ne pousse pas dans le path
    const history: DrillDownNode[] = [
      { question: "Q1", optionA: "Arts visuels", optionB: "Arts vivants", choice: "neither" },
    ];
    const path = extractBranchPath("culture_knowledge", history);
    assert(
      JSON.stringify(path) === JSON.stringify(["Culture & Savoir"]),
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
      themeSlug: "social_fun",
      isHome: false,
      history,
      choice: "A",
    });
    assert(
      JSON.stringify(state.branchPath) === JSON.stringify(["Jeux & Social", "Restaurant", "Italien"]),
      "Multi-niveaux → branchPath correct",
      `obtenu: ${JSON.stringify(state.branchPath)}`,
    );
    assert(state.currentCategory === "Italien", "currentCategory = dernier élément du path");
  }

  // ── userHint comme racine du branchPath ────────────────────────────
  console.log("\n  — userHint remplace le nom du thème —");
  {
    // Avec userHint : la racine est le hint, pas le nom du thème
    const state = buildDrillDownState({
      themeSlug: "story_screen",
      isHome: true,
      history: [],
      choice: undefined,
      userHint: "je veux jouer à un jeu vidéo",
    });
    assert(
      JSON.stringify(state.branchPath) === JSON.stringify(["je veux jouer à un jeu vidéo"]),
      "userHint → branchPath = [hint]",
      `obtenu: ${JSON.stringify(state.branchPath)}`,
    );
    assert(state.currentCategory === "je veux jouer à un jeu vidéo", "userHint → currentCategory = hint");
    assert(
      state.instruction.includes("je veux jouer à un jeu vidéo"),
      "userHint → instruction mentionne le hint, pas le thème",
    );
    assert(
      !state.instruction.includes("Histoires & Écrans"),
      "userHint → instruction ne mentionne PAS le nom du thème",
    );
  }

  {
    // Avec userHint + historique : le hint reste racine, les choix s'empilent
    const history: DrillDownNode[] = [
      { question: "Q1", optionA: "RPG", optionB: "FPS", choice: "A" },
    ];
    const state = buildDrillDownState({
      themeSlug: "story_screen",
      isHome: true,
      history,
      choice: "B",
      userHint: "je veux jouer à un jeu vidéo",
    });
    assert(
      JSON.stringify(state.branchPath) === JSON.stringify(["je veux jouer à un jeu vidéo", "RPG"]),
      "userHint + historique → branchPath = [hint, RPG]",
      `obtenu: ${JSON.stringify(state.branchPath)}`,
    );
    assert(state.currentCategory === "RPG", "userHint + historique → currentCategory = RPG");
  }

  {
    // Sans userHint : comportement classique (nom du thème)
    const state = buildDrillDownState({
      themeSlug: "story_screen",
      isHome: true,
      history: [],
      choice: undefined,
    });
    assert(
      state.branchPath[0] !== "je veux jouer à un jeu vidéo",
      "Sans userHint → branchPath ne contient pas de hint",
    );
    assert(
      state.branchPath[0] === "Histoires & Écrans",
      "Sans userHint → branchPath[0] = nom du thème",
      `obtenu: ${state.branchPath[0]}`,
    );
  }

  {
    // extractBranchPath directement avec userHint
    const path = extractBranchPath("move_sport", [], "faire du yoga");
    assert(
      JSON.stringify(path) === JSON.stringify(["faire du yoga"]),
      "extractBranchPath avec userHint → [hint]",
      `obtenu: ${JSON.stringify(path)}`,
    );
  }

  {
    // extractBranchPath sans userHint → comportement classique
    const path = extractBranchPath("move_sport", []);
    assert(
      path[0] === "Mouvement & Sport",
      "extractBranchPath sans userHint → [theme.name]",
      `obtenu: ${path[0]}`,
    );
  }

  // ── mayFinalize ────────────────────────────────────────────────────
  console.log("\n  — mayFinalize (LLM décide) —");
  {
    // Avant minDepth : mayFinalize = false → le LLM ne peut PAS finaliser
    const history: DrillDownNode[] = [
      { question: "Q1", optionA: "A1", optionB: "B1", choice: "A" },
    ];
    const state = buildDrillDownState({
      themeSlug: "move_sport",
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
      themeSlug: "move_sport",
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
      themeSlug: "move_sport",
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
      themeSlug: "move_sport",
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
      themeSlug: "social_fun",
      isHome: true,
      history: [],
      choice: undefined,
    });
    assert(
      state.instruction.includes("Jeux & Social"),
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
      themeSlug: "social_fun",
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
      themeSlug: "social_fun",
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
      themeSlug: "social_fun",
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
      themeSlug: "social_fun",
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
      themeSlug: "nature_adventure",
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
      themeSlug: "nature_adventure",
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
      themeSlug: "nature_adventure",
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
      themeSlug: "nature_adventure",
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
      themeSlug: "move_sport",
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
      themeSlug: "move_sport",
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
      themeSlug: "move_sport",
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
      themeSlug: "move_sport",
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
      themeSlug: "move_sport",
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
      themeSlug: "move_sport",
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
      themeSlug: "move_sport",
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
      themeSlug: "move_sport",
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
// Tests — Subscriptions injection in buildDrillDownMessages
// ---------------------------------------------------------------------------

function testSubscriptionsInjection() {
  console.log("\n═══ Tests Tree Logic — Subscriptions Injection ═══\n");

  const baseState = buildDrillDownState({
    themeSlug: "story_screen",
    isHome: true,
    history: [],
    choice: undefined,
  });

  const baseContext = { environment: "À la maison", social: "Seul" };

  // ── Sans subscriptions → pas de message system supplémentaire ──
  console.log("  — Sans subscriptions —");
  {
    const messages = buildDrillDownMessages(baseState, baseContext, [], "fr", "Préférences grimoire");
    const subscriptionMessages = messages.filter(m => m.content.includes("abonnements suivants"));
    assert(
      subscriptionMessages.length === 0,
      "Sans subscriptions → aucun message 'abonnements suivants'",
    );
  }

  {
    const messages = buildDrillDownMessages(baseState, baseContext, [], "fr", "Préférences grimoire", undefined);
    const subscriptionMessages = messages.filter(m => m.content.includes("abonnements suivants"));
    assert(
      subscriptionMessages.length === 0,
      "subscriptions=undefined → aucun message 'abonnements suivants'",
    );
  }

  {
    const messages = buildDrillDownMessages(baseState, baseContext, [], "fr", "Préférences grimoire", undefined, "");
    const subscriptionMessages = messages.filter(m => m.content.includes("abonnements suivants"));
    assert(
      subscriptionMessages.length === 0,
      "subscriptions='' → aucun message 'abonnements suivants'",
    );
  }

  // ── Avec subscriptions → message system injecté ──
  console.log("\n  — Avec subscriptions —");
  {
    const subscriptionsText = "L'utilisateur dispose des abonnements suivants : 🎬 Netflix, 🎵 Spotify.";
    const messages = buildDrillDownMessages(baseState, baseContext, [], "fr", "Préférences grimoire", undefined, subscriptionsText);
    const subscriptionMessages = messages.filter(m => m.content.includes("abonnements suivants"));
    assert(
      subscriptionMessages.length === 1,
      "Avec subscriptions → 1 message 'abonnements suivants'",
      `obtenu: ${subscriptionMessages.length}`,
    );
    assert(
      subscriptionMessages[0].role === "system",
      "Le message subscriptions est un system message",
      `obtenu: ${subscriptionMessages[0].role}`,
    );
    assert(
      subscriptionMessages[0].content.includes("Netflix"),
      "Le message subscriptions contient 'Netflix'",
    );
    assert(
      subscriptionMessages[0].content.includes("Spotify"),
      "Le message subscriptions contient 'Spotify'",
    );
  }

  // ── Position : après preferences, avant userHint ──
  console.log("\n  — Position dans les messages —");
  {
    const subscriptionsText = "L'utilisateur dispose des abonnements suivants : 🎬 Netflix.";
    const messages = buildDrillDownMessages(
      baseState, baseContext, [], "fr",
      "PREFERENCES_GRIMOIRE_TEXT",
      "HINT_TEXT",
      subscriptionsText,
    );

    const prefIdx = messages.findIndex(m => m.content.includes("PREFERENCES_GRIMOIRE_TEXT"));
    const subsIdx = messages.findIndex(m => m.content.includes("abonnements suivants"));
    const hintIdx = messages.findIndex(m => m.content.includes("HINT_TEXT"));

    assert(prefIdx >= 0, "Message preferences trouvé");
    assert(subsIdx >= 0, "Message subscriptions trouvé");
    assert(hintIdx >= 0, "Message hint trouvé");
    assert(
      subsIdx > prefIdx,
      "subscriptions après preferences",
      `pref=${prefIdx}, subs=${subsIdx}`,
    );
    assert(
      subsIdx < hintIdx,
      "subscriptions avant hint",
      `subs=${subsIdx}, hint=${hintIdx}`,
    );
  }
}

// ---------------------------------------------------------------------------
// Tests — Classify Hint (PATCH_CONTEXT + validation serveur)
// ---------------------------------------------------------------------------

function testClassifyHint() {
  console.log("\n═══ Tests Tree Logic — Classify Hint ═══\n");

  // ── PATCH_CONTEXT logic (tested inline, reducer imports React Native) ──
  console.log("  — PATCH_CONTEXT logic —");
  {
    // Simuler la logique du reducer PATCH_CONTEXT
    const patchContext = (
      state: { context: Record<string, unknown> | null },
      payload: Record<string, unknown>,
    ) => ({
      ...state,
      context: state.context ? { ...state.context, ...payload } : null,
    });

    const baseState = {
      context: { social: "solo", environment: "env_home" } as Record<string, unknown>,
      sessionId: "test-session",
      phase: "theme_duel",
    };

    const result = patchContext(baseState, { user_hint: "je veux faire du sport" });

    assert(result.context !== null, "PATCH_CONTEXT → context non null");
    assert(
      result.context!.user_hint === "je veux faire du sport",
      "PATCH_CONTEXT → user_hint injecté",
      `obtenu: ${result.context!.user_hint}`,
    );
    assert(
      result.context!.social === "solo",
      "PATCH_CONTEXT → social préservé",
      `obtenu: ${result.context!.social}`,
    );
    assert(
      result.context!.environment === "env_home",
      "PATCH_CONTEXT → environment préservé",
      `obtenu: ${result.context!.environment}`,
    );
    assert(
      result.sessionId === "test-session",
      "PATCH_CONTEXT → sessionId préservé (pas de reset)",
    );
    assert(
      result.phase === "theme_duel",
      "PATCH_CONTEXT → phase préservée (pas de reset)",
    );
  }

  {
    // PATCH_CONTEXT avec context null → reste null
    const patchContext = (
      state: { context: Record<string, unknown> | null },
      payload: Record<string, unknown>,
    ) => ({
      ...state,
      context: state.context ? { ...state.context, ...payload } : null,
    });

    const nullState = { context: null };
    const result = patchContext(nullState, { user_hint: "test" });
    assert(result.context === null, "PATCH_CONTEXT avec context null → reste null");
  }

  // ── Éligibilité environnement dans la classification ──────────────
  console.log("\n  — Éligibilité thèmes pour classification —");
  {
    const homeEligible = getEligibleThemes({ environment: "env_home" });
    const homeSlugs = homeEligible.map(t => t.slug);
    assert(
      homeSlugs.includes("nature_adventure"),
      "Classification env_home → nature_adventure inclus dans le set éligible",
    );
    assert(
      homeSlugs.includes("food_drink"),
      "Classification env_home → food_drink inclus dans le set éligible",
    );
    assert(
      homeEligible.length === 8,
      `Classification env_home → 8 thèmes éligibles (obtenu: ${homeEligible.length})`,
    );
  }

  {
    const openAirEligible = getEligibleThemes({ environment: "env_open_air" });
    const openAirSlugs = openAirEligible.map(t => t.slug);
    assert(
      openAirSlugs.includes("story_screen"),
      "Classification env_open_air → story_screen inclus dans le set éligible",
    );
    assert(
      openAirSlugs.includes("nature_adventure"),
      "Classification env_open_air → nature_adventure inclus dans le set éligible",
    );
    assert(
      openAirEligible.length === 8,
      `Classification env_open_air → 8 thèmes éligibles (obtenu: ${openAirEligible.length})`,
    );
  }

  // ── Validation : slug invalide → classify_failed ──────────────────
  console.log("\n  — Validation classify response —");
  {
    const eligible = getEligibleThemes({ environment: "env_home" });
    const eligibleSlugs = new Set(eligible.map(t => t.slug));

    // Slug hors ensemble éligible (slug fictif)
    const invalidSlug = "nonexistent_theme";
    assert(
      !eligibleSlugs.has(invalidSlug),
      "Slug inexistant pas dans éligible → classify_failed attendu",
    );

    // Slug fictif
    assert(
      !eligibleSlugs.has("inexistant_theme"),
      "Slug fictif pas dans éligible → classify_failed attendu",
    );
  }

  // ── Validation : confidence < 0.3 → classify_failed ───────────────
  {
    // Simuler la logique de validation serveur
    const eligible = getEligibleThemes({ environment: "env_shelter" });
    const eligibleSlugs = new Set(eligible.map(t => t.slug));

    const lowConfidence = { theme_slug: "food_drink", confidence: 0.2 };
    const isValid = (
      typeof lowConfidence.theme_slug === "string"
      && eligibleSlugs.has(lowConfidence.theme_slug)
      && typeof lowConfidence.confidence === "number"
      && lowConfidence.confidence >= 0.3
    );
    assert(!isValid, "confidence=0.2 → validation échoue (seuil 0.3)");

    const highConfidence = { theme_slug: "food_drink", confidence: 0.8 };
    const isValid2 = (
      typeof highConfidence.theme_slug === "string"
      && eligibleSlugs.has(highConfidence.theme_slug)
      && typeof highConfidence.confidence === "number"
      && highConfidence.confidence >= 0.3
    );
    assert(isValid2, "confidence=0.8 → validation réussit");

    // Confidence exactement 0.3 → valide (seuil inclusif)
    const borderConfidence = { theme_slug: "food_drink", confidence: 0.3 };
    const isValid3 = (
      typeof borderConfidence.theme_slug === "string"
      && eligibleSlugs.has(borderConfidence.theme_slug)
      && typeof borderConfidence.confidence === "number"
      && borderConfidence.confidence >= 0.3
    );
    assert(isValid3, "confidence=0.3 → validation réussit (seuil inclusif)");
  }

  // ── NSFW gate : is_nsfw=true → classify_nsfw ─────────────────────
  console.log("\n  — NSFW gate (classify_hint) —");
  {
    const eligible = getEligibleThemes({ environment: "env_shelter" });
    const eligibleSlugs = new Set(eligible.map(t => t.slug));

    // Simuler la logique serveur : is_nsfw=true → court-circuite avant validation thème
    const nsfwResponse = { theme_slug: "social_fun", confidence: 0.8, is_nsfw: true };
    const isNsfw = nsfwResponse.is_nsfw === true;
    assert(isNsfw, "is_nsfw=true → détecté comme NSFW");

    // Même avec un thème valide et haute confiance, is_nsfw bloque
    const wouldBeValid = (
      typeof nsfwResponse.theme_slug === "string"
      && eligibleSlugs.has(nsfwResponse.theme_slug)
      && typeof nsfwResponse.confidence === "number"
      && nsfwResponse.confidence >= 0.3
    );
    assert(wouldBeValid, "is_nsfw=true mais le thème serait valide sans la gate");

    // is_nsfw=false → pas de blocage
    const cleanResponse = { theme_slug: "food_drink", confidence: 0.7, is_nsfw: false };
    assert(cleanResponse.is_nsfw !== true, "is_nsfw=false → pas bloqué");

    // is_nsfw absent → pas de blocage (rétrocompatibilité)
    const legacyResponse: { theme_slug: string; confidence: number; is_nsfw?: boolean } =
      { theme_slug: "food_drink", confidence: 0.7 };
    assert(legacyResponse.is_nsfw !== true, "is_nsfw absent → pas bloqué (rétrocompatibilité)");
  }

  // ── SET_CLASSIFY_ERROR / CLEAR_CLASSIFY_ERROR / SELECT_THEME cleanup ──
  console.log("\n  — SET_CLASSIFY_ERROR reducer —");
  {
    // Simuler les cases reducer inline (le vrai reducer importe React Native)
    type ReducerState = {
      classifyError: string | null;
      themesExhausted: boolean;
      phase: string;
      loading: boolean;
      error: string | null;
      context: Record<string, unknown> | null;
    };

    const applySetClassifyError = (state: ReducerState, payload: string): ReducerState => ({
      ...state,
      classifyError: payload,
      themesExhausted: true,
      phase: "theme_duel",
      loading: false,
      error: null,
    });

    const applyClearClassifyError = (state: ReducerState): ReducerState => ({
      ...state,
      classifyError: null,
    });

    const applySelectTheme = (state: ReducerState): ReducerState => ({
      ...state,
      classifyError: null,
      themesExhausted: false,
      phase: "drill_down",
      loading: false,
    });

    // SET_CLASSIFY_ERROR
    const base: ReducerState = {
      classifyError: null,
      themesExhausted: false,
      phase: "theme_duel",
      loading: true,
      error: null,
      context: { social: "solo", environment: "env_home", user_hint: "je veux du sport" },
    };

    const afterError = applySetClassifyError(base, "Hmm, je n'arrive pas à cerner...");
    assert(afterError.classifyError === "Hmm, je n'arrive pas à cerner...", "SET_CLASSIFY_ERROR → classifyError défini");
    assert(afterError.themesExhausted === true, "SET_CLASSIFY_ERROR → themesExhausted=true");
    assert(afterError.phase === "theme_duel", "SET_CLASSIFY_ERROR → phase=theme_duel");
    assert(afterError.loading === false, "SET_CLASSIFY_ERROR → loading=false");
    assert(afterError.error === null, "SET_CLASSIFY_ERROR → error=null");
    assert(
      (afterError.context as any)?.user_hint === "je veux du sport",
      "SET_CLASSIFY_ERROR → context.user_hint préservé",
    );

    // CLEAR_CLASSIFY_ERROR
    const afterClear = applyClearClassifyError(afterError);
    assert(afterClear.classifyError === null, "CLEAR_CLASSIFY_ERROR → classifyError=null");
    assert(afterClear.themesExhausted === true, "CLEAR_CLASSIFY_ERROR → themesExhausted inchangé");

    // SELECT_THEME nettoie classifyError
    const afterSelect = applySelectTheme(afterError);
    assert(afterSelect.classifyError === null, "SELECT_THEME → classifyError nettoyé");
    assert(afterSelect.themesExhausted === false, "SELECT_THEME → themesExhausted=false");
    assert(afterSelect.phase === "drill_down", "SELECT_THEME → phase=drill_down");
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
  testSubscriptionsInjection();
  testClassifyHint();

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
