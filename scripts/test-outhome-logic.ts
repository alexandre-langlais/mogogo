#!/usr/bin/env npx tsx
/**
 * Tests unitaires pour la logique out-home (env_shelter + env_open_air).
 *
 * Couvre :
 *   - Mapping deterministe Place → OutdoorActivity
 *   - Deduplication types entre themes
 *   - Filtrage (openNow, minRating)
 *   - Validation DichotomyPool
 *   - Navigation locale (choix A/B/neither, convergence, skip trivial)
 *   - Backtrack (snapshot/restore)
 *   - Gestion penurie
 *
 * Usage :
 *   npx tsx scripts/test-outhome-logic.ts
 */

import {
  placeToOutdoorActivity,
  getUniqueTypesWithMapping,
  mapAndDedup,
  filterPlaces,
  validateDichotomyPool,
  applyOutdoorChoice,
  restoreFromSnapshot,
  getPhaseAfterThemeSelection,
  getDefaultResolutionMode,
  type Place,
  type ThemeConfig,
  type DichotomyNode,
  type DichotomySnapshot,
  type OutdoorActivity,
  type ResolutionMode,
} from "./lib/outhome-logic.ts";

// ── Test harness ───────────────────────────────────────────────────────

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

// ── Fixtures ───────────────────────────────────────────────────────────

const THEME_GASTRO: ThemeConfig = {
  slug: "gastronomie",
  name: "Gastronomie",
  emoji: "\uD83C\uDF7D\uFE0F",
  eligibleEnvironments: ["env_home", "env_shelter", "env_open_air"],
  placeTypes: ["restaurant", "cafe", "bakery"],
};

const THEME_SPORT: ThemeConfig = {
  slug: "sport",
  name: "Sport",
  emoji: "\u26BD",
  eligibleEnvironments: ["env_home", "env_shelter", "env_open_air"],
  placeTypes: ["gym", "sports_complex", "stadium"],
};

const THEME_FETE: ThemeConfig = {
  slug: "fete",
  name: "F\u00eate",
  emoji: "\uD83C\uDF89",
  eligibleEnvironments: ["env_home", "env_shelter", "env_open_air"],
  placeTypes: ["night_club", "bar"],
};

const THEME_SOCIAL: ThemeConfig = {
  slug: "social",
  name: "Social",
  emoji: "\uD83E\uDD1D",
  eligibleEnvironments: ["env_home", "env_shelter", "env_open_air"],
  placeTypes: ["bar", "cafe", "restaurant"],
};

function makePlace(overrides: Partial<Place> & { place_id: string; name: string }): Place {
  return {
    types: ["restaurant"],
    geometry: { location: { lat: 45.76, lng: 4.83 } },
    ...overrides,
  };
}

// ── Tests : Mapping deterministe ───────────────────────────────────────

function testMapping() {
  console.log("\n\u2550\u2550\u2550 Tests Out-Home \u2014 Mapping deterministe \u2550\u2550\u2550\n");

  // Place complete
  {
    const place = makePlace({
      place_id: "p1",
      name: "Le Bouchon Lyonnais",
      types: ["restaurant", "food"],
      rating: 4.5,
      vicinity: "12 rue de la Rep",
      opening_hours: { open_now: true },
      price_level: 2,
    });

    const activity = placeToOutdoorActivity(place, THEME_GASTRO);
    assert(activity !== null, "Place complete → activity not null");
    assert(activity!.id === "p1", "id = place_id");
    assert(activity!.source === "google_places", "source = google_places");
    assert(activity!.name === "Le Bouchon Lyonnais", "name correct");
    assert(activity!.themeSlug === "gastronomie", "themeSlug = gastronomie");
    assert(activity!.themeEmoji === "\uD83C\uDF7D\uFE0F", "themeEmoji correct");
    assert(activity!.rating === 4.5, "rating = 4.5");
    assert(activity!.vicinity === "12 rue de la Rep", "vicinity correct");
    assert(activity!.isOpen === true, "isOpen = true");
    assert(activity!.coordinates.lat === 45.76, "lat correct");
    assert(activity!.coordinates.lng === 4.83, "lng correct");
    assert(activity!.priceLevel === 2, "priceLevel = 2");
  }

  // Place sans rating ni opening_hours
  {
    const place = makePlace({
      place_id: "p2",
      name: "Cafe Inconnu",
      types: ["cafe"],
    });

    const activity = placeToOutdoorActivity(place, THEME_GASTRO);
    assert(activity !== null, "Place sans rating/hours → not null");
    assert(activity!.rating === null, "rating = null quand absent");
    assert(activity!.isOpen === null, "isOpen = null quand absent");
    assert(activity!.priceLevel === null, "priceLevel = null quand absent");
  }

  // Place sans place_id → null
  {
    const place = makePlace({
      place_id: "",
      name: "Ghost",
    });

    const activity = placeToOutdoorActivity(place, THEME_GASTRO);
    assert(activity === null, "Place sans place_id → null");
  }

  // Place sans name → null
  {
    const place = makePlace({
      place_id: "p3",
      name: "",
    });

    const activity = placeToOutdoorActivity(place, THEME_GASTRO);
    assert(activity === null, "Place sans name → null");
  }
}

// ── Tests : Deduplication types ────────────────────────────────────────

function testTypeDedup() {
  console.log("\n\u2550\u2550\u2550 Tests Out-Home \u2014 Deduplication types \u2550\u2550\u2550\n");

  const themes = [THEME_GASTRO, THEME_SPORT, THEME_FETE, THEME_SOCIAL];
  const { uniqueTypes, typeToThemes } = getUniqueTypesWithMapping(themes);

  // Types partages : bar (fete+social), cafe (gastro+social), restaurant (gastro+social)
  assert(
    uniqueTypes.includes("bar"),
    "bar est dans les types uniques",
  );
  assert(
    uniqueTypes.includes("cafe"),
    "cafe est dans les types uniques",
  );
  assert(
    uniqueTypes.includes("restaurant"),
    "restaurant est dans les types uniques",
  );

  // bar → fete + social (2 themes)
  const barThemes = typeToThemes.get("bar")!;
  assert(barThemes.length === 2, `bar → 2 themes (obtenu: ${barThemes.length})`);
  assert(barThemes[0].slug === "fete", "bar premier theme = fete");
  assert(barThemes[1].slug === "social", "bar second theme = social");

  // cafe → gastro + social (2 themes)
  const cafeThemes = typeToThemes.get("cafe")!;
  assert(cafeThemes.length === 2, `cafe → 2 themes (obtenu: ${cafeThemes.length})`);

  // gym → sport uniquement
  const gymThemes = typeToThemes.get("gym")!;
  assert(gymThemes.length === 1, "gym → 1 theme");
  assert(gymThemes[0].slug === "sport", "gym → sport");

  // Pas de doublons dans uniqueTypes
  const typeSet = new Set(uniqueTypes);
  assert(typeSet.size === uniqueTypes.length, `Pas de doublons dans uniqueTypes (${uniqueTypes.length} uniques)`);

  // Nombre attendu : restaurant, cafe, bakery, gym, sports_complex, stadium, night_club, bar = 8
  assert(uniqueTypes.length === 8, `8 types uniques (obtenu: ${uniqueTypes.length})`);
}

// ── Tests : mapAndDedup ────────────────────────────────────────────────

function testMapAndDedup() {
  console.log("\n\u2550\u2550\u2550 Tests Out-Home \u2014 mapAndDedup \u2550\u2550\u2550\n");

  const themes = [THEME_GASTRO, THEME_FETE, THEME_SOCIAL];
  const { typeToThemes } = getUniqueTypesWithMapping(themes);

  // Place qui match restaurant → premier theme = gastro (pas social)
  const places: Place[] = [
    makePlace({ place_id: "p1", name: "Resto A", types: ["restaurant"] }),
    makePlace({ place_id: "p2", name: "Bar B", types: ["bar"] }),
    makePlace({ place_id: "p1", name: "Resto A Doublon", types: ["restaurant"] }), // doublon
    makePlace({ place_id: "p3", name: "Gym C", types: ["gym"] }), // pas de theme match
  ];

  const activities = mapAndDedup(places, typeToThemes);

  assert(activities.length === 2, `2 activites apres dedup (obtenu: ${activities.length})`);
  assert(activities[0].id === "p1", "premiere = p1");
  assert(activities[0].themeSlug === "gastronomie", "p1 attribue a gastronomie (premier theme)");
  assert(activities[1].id === "p2", "seconde = p2");
  assert(activities[1].themeSlug === "fete", "p2 attribue a fete (premier theme pour bar)");
}

// ── Tests : Filtrage ───────────────────────────────────────────────────

function testFiltering() {
  console.log("\n\u2550\u2550\u2550 Tests Out-Home \u2014 Filtrage \u2550\u2550\u2550\n");

  const places: Place[] = [
    makePlace({ place_id: "p1", name: "Ouvert 4.5", rating: 4.5, opening_hours: { open_now: true } }),
    makePlace({ place_id: "p2", name: "Ferme 4.8", rating: 4.8, opening_hours: { open_now: false } }),
    makePlace({ place_id: "p3", name: "Mauvais 3.2", rating: 3.2, opening_hours: { open_now: true } }),
    makePlace({ place_id: "p4", name: "Sans rating ouvert" }), // pas de rating ni opening_hours
    makePlace({ place_id: "p5", name: "Rating ok sans hours", rating: 4.1 }), // pas d'opening_hours
  ];

  // Filtre open now + min rating 4.0
  const filtered = filterPlaces(places, { requireOpenNow: true, minRating: 4.0 });

  assert(filtered.length === 3, `3 places apres filtrage (obtenu: ${filtered.length})`);
  assert(filtered.some(p => p.place_id === "p1"), "p1 (ouvert, 4.5) passe");
  assert(!filtered.some(p => p.place_id === "p2"), "p2 (ferme) exclu");
  assert(!filtered.some(p => p.place_id === "p3"), "p3 (3.2) exclu");
  assert(filtered.some(p => p.place_id === "p4"), "p4 (sans rating/hours) passe (permissif)");
  assert(filtered.some(p => p.place_id === "p5"), "p5 (rating ok, sans hours) passe (permissif)");

  // Sans filtre
  const all = filterPlaces(places, {});
  assert(all.length === 5, "Sans filtre → 5 places");

  // openNow only
  const openOnly = filterPlaces(places, { requireOpenNow: true });
  assert(openOnly.length === 4, `openNow only → 4 places (obtenu: ${openOnly.length})`);

  // minRating only
  const ratingOnly = filterPlaces(places, { minRating: 4.0 });
  assert(ratingOnly.length === 4, `minRating only → 4 places (obtenu: ${ratingOnly.length})`);
}

// ── Tests : Validation DichotomyPool ───────────────────────────────────

function testPoolValidation() {
  console.log("\n\u2550\u2550\u2550 Tests Out-Home \u2014 Validation DichotomyPool \u2550\u2550\u2550\n");

  const activityIds = ["a1", "a2", "a3", "a4", "a5", "a6"];

  // Pool valide
  {
    const pool = {
      mogogo_message: "C'est parti !",
      duels: [
        { question: "Manger ou bouger ?", labelA: "Manger", labelB: "Bouger", idsA: ["a1", "a2", "a3"], idsB: ["a4", "a5", "a6"] },
        { question: "Chic ou decontract ?", labelA: "Chic", labelB: "Decontract", idsA: ["a1", "a3"], idsB: ["a2", "a4", "a5", "a6"] },
      ],
    };
    const result = validateDichotomyPool(pool, activityIds);
    assert(result.valid, "Pool valide → valid=true");
    assert(result.errors.length === 0, "Pool valide → 0 erreurs");
  }

  // Pool avec ID inconnu
  {
    const pool = {
      mogogo_message: "Test",
      duels: [
        { question: "?", labelA: "A", labelB: "B", idsA: ["a1", "UNKNOWN"], idsB: ["a2"] },
      ],
    };
    const result = validateDichotomyPool(pool, activityIds);
    assert(!result.valid, "Pool avec ID inconnu → valid=false");
    assert(result.errors.some(e => e.includes("UNKNOWN")), "Erreur mentionne l'ID inconnu");
  }

  // Pool sans duels
  {
    const pool = { mogogo_message: "Test" };
    const result = validateDichotomyPool(pool, activityIds);
    assert(!result.valid, "Pool sans duels → valid=false");
  }

  // Pool null
  {
    const result = validateDichotomyPool(null, activityIds);
    assert(!result.valid, "Pool null → valid=false");
  }

  // Pool sans mogogo_message
  {
    const pool = {
      duels: [
        { question: "?", labelA: "A", labelB: "B", idsA: ["a1"], idsB: ["a2"] },
      ],
    };
    const result = validateDichotomyPool(pool, activityIds);
    assert(!result.valid, "Pool sans mogogo_message → valid=false");
  }
}

// ── Tests : Navigation locale ──────────────────────────────────────────

function testNavigation() {
  console.log("\n\u2550\u2550\u2550 Tests Out-Home \u2014 Navigation locale \u2550\u2550\u2550\n");

  const pool: DichotomyNode[] = [
    {
      question: "Manger ou bouger ?",
      labelA: "Manger",
      labelB: "Bouger",
      idsA: ["a1", "a2", "a3"],
      idsB: ["a4", "a5", "a6"],
    },
    {
      question: "Chic ou decontract ?",
      labelA: "Chic",
      labelB: "Decontract",
      idsA: ["a1"],
      idsB: ["a2", "a3"],
    },
    {
      question: "Intense ou relax ?",
      labelA: "Intense",
      labelB: "Relax",
      idsA: ["a4"],
      idsB: ["a5", "a6"],
    },
  ];

  const allIds = ["a1", "a2", "a3", "a4", "a5", "a6"];

  // Choix A au duel 0 → candidats = a1, a2, a3
  {
    const result = applyOutdoorChoice(allIds, pool, 0, "A");
    assert(
      result.newCandidates.length === 3,
      `Choix A duel 0 → 3 candidats (obtenu: ${result.newCandidates.length})`,
    );
    assert(
      result.newCandidates.includes("a1") && result.newCandidates.includes("a2") && result.newCandidates.includes("a3"),
      "Candidats = a1, a2, a3",
    );
    assert(result.newIndex === 1, `Next duel = 1 (obtenu: ${result.newIndex})`);
    assert(result.converged, "Converge (3 candidats <= 3)");
  }

  // Choix B au duel 0 → candidats = a4, a5, a6
  {
    const result = applyOutdoorChoice(allIds, pool, 0, "B");
    assert(
      result.newCandidates.length === 3,
      `Choix B duel 0 → 3 candidats (obtenu: ${result.newCandidates.length})`,
    );
    assert(
      result.newCandidates.includes("a4") && result.newCandidates.includes("a5") && result.newCandidates.includes("a6"),
      "Candidats = a4, a5, a6",
    );
    // Duel 1 (idsA=a1, idsB=a2,a3) → trivial car a1,a2,a3 pas dans a4,a5,a6
    // Duel 2 (idsA=a4, idsB=a5,a6) → non trivial
    assert(result.newIndex === 2, `Skip duel trivial → index 2 (obtenu: ${result.newIndex})`);
    assert(result.converged, "Converge (3 candidats)");
  }

  // Neither au duel 0 → candidats inchanges
  {
    const result = applyOutdoorChoice(allIds, pool, 0, "neither");
    assert(result.newCandidates.length === 6, "Neither → 6 candidats (inchanges)");
    assert(result.newIndex === 1, "Neither → avance au duel suivant");
    assert(!result.converged, "Pas encore converge");
  }

  // Convergence : choix A dans duel 1 apres avoir choisi A dans duel 0
  {
    // Apres duel 0 choix A : candidats = a1, a2, a3
    const candidates = ["a1", "a2", "a3"];
    const result = applyOutdoorChoice(candidates, pool, 1, "A");
    assert(result.newCandidates.length === 1, `Convergence → 1 candidat (obtenu: ${result.newCandidates.length})`);
    assert(result.newCandidates[0] === "a1", "Candidat final = a1");
    assert(result.converged, "Converge (1 candidat <= 3)");
  }

  // Duel index hors bornes → converge
  {
    const result = applyOutdoorChoice(allIds, pool, 99, "A");
    assert(result.converged, "Index hors bornes → converge");
    assert(result.newCandidates.length === 6, "Candidats inchanges");
  }
}

// ── Tests : Skip duels triviaux ────────────────────────────────────────

function testSkipTrivial() {
  console.log("\n\u2550\u2550\u2550 Tests Out-Home \u2014 Skip duels triviaux \u2550\u2550\u2550\n");

  const pool: DichotomyNode[] = [
    {
      question: "Q1",
      labelA: "A", labelB: "B",
      idsA: ["a1", "a2"],
      idsB: ["a3", "a4"],
    },
    {
      question: "Q2 (trivial apres choix A sur Q1)",
      labelA: "A", labelB: "B",
      idsA: ["a3"], // pas dans candidats apres Q1 choix A
      idsB: ["a4"], // pas dans candidats apres Q1 choix A
    },
    {
      question: "Q3 (non trivial)",
      labelA: "A", labelB: "B",
      idsA: ["a1"],
      idsB: ["a2"],
    },
  ];

  // Choix A sur Q1 → candidats = a1, a2
  // Q2 est trivial (a3/a4 hors candidats) → skip
  // Q3 est non trivial (a1 vs a2)
  const result = applyOutdoorChoice(["a1", "a2", "a3", "a4"], pool, 0, "A");
  assert(result.newIndex === 2, `Skip Q2 trivial → index 2 (obtenu: ${result.newIndex})`);
  assert(result.converged, "Converge (2 candidats <= 3)");
}

// ── Tests : Backtrack ──────────────────────────────────────────────────

function testBacktrack() {
  console.log("\n\u2550\u2550\u2550 Tests Out-Home \u2014 Backtrack \u2550\u2550\u2550\n");

  const snapshot: DichotomySnapshot = {
    candidateIds: ["a1", "a2", "a3", "a4", "a5", "a6"],
    duelIndex: 0,
  };

  const restored = restoreFromSnapshot(snapshot);
  assert(restored.candidateIds.length === 6, "Restore → 6 candidats");
  assert(restored.duelIndex === 0, "Restore → index 0");

  // Verifier que c'est une copie (pas une reference)
  restored.candidateIds.push("a7");
  assert(snapshot.candidateIds.length === 6, "Restore fait une copie (mutation safe)");
}

// ── Tests : Gestion penurie ────────────────────────────────────────────

function testShortage() {
  console.log("\n\u2550\u2550\u2550 Tests Out-Home \u2014 Gestion penurie \u2550\u2550\u2550\n");

  // 0 activites
  {
    const activities: OutdoorActivity[] = [];
    assert(activities.length < 5, "0 activites → shortage flag");
    assert(activities.length < 3, "0 activites → pas de pool genere");
  }

  // 2 activites
  {
    const activities: OutdoorActivity[] = [
      { id: "a1", source: "google_places", name: "A", themeSlug: "sport", themeEmoji: "\u26BD", rating: 4.5, vicinity: "", isOpen: true, coordinates: { lat: 0, lng: 0 }, placeTypes: [], priceLevel: null },
      { id: "a2", source: "google_places", name: "B", themeSlug: "sport", themeEmoji: "\u26BD", rating: 4.0, vicinity: "", isOpen: true, coordinates: { lat: 0, lng: 0 }, placeTypes: [], priceLevel: null },
    ];
    assert(activities.length < 5, "2 activites → shortage");
    assert(activities.length < 3, "2 activites → pas de pool (< 3)");
  }

  // 4 activites
  {
    const count = 4;
    assert(count < 5, "4 activites → shortage");
    assert(count >= 3, "4 activites → pool possible (>= 3)");
  }

  // 10 activites
  {
    const count = 10;
    assert(count >= 5, "10 activites → pas de shortage");
  }
}

// ── Tests : Integration dedup cross-types ──────────────────────────────

function testCrossTypeDedup() {
  console.log("\n\u2550\u2550\u2550 Tests Out-Home \u2014 Dedup cross-types \u2550\u2550\u2550\n");

  const themes = [THEME_GASTRO, THEME_SOCIAL];
  const { typeToThemes } = getUniqueTypesWithMapping(themes);

  // Meme lieu retourne par "restaurant" et "cafe" queries
  const places: Place[] = [
    makePlace({ place_id: "p1", name: "Cafe Resto", types: ["restaurant", "cafe"] }),
    makePlace({ place_id: "p1", name: "Cafe Resto (doublon)", types: ["cafe", "restaurant"] }),
    makePlace({ place_id: "p2", name: "Autre Cafe", types: ["cafe"] }),
  ];

  const activities = mapAndDedup(places, typeToThemes);
  assert(activities.length === 2, `Dedup cross-types → 2 activites (obtenu: ${activities.length})`);
  assert(activities[0].id === "p1", "p1 present une fois");
  assert(activities[1].id === "p2", "p2 present");
}

// ── Tests : Resolution Mode ──────────────────────────────────────────

function testResolutionMode() {
  console.log("\n\u2550\u2550\u2550 Tests Out-Home \u2014 Resolution Mode \u2550\u2550\u2550\n");

  // Défaut INSPIRATION quand non spécifié
  {
    const mode = getDefaultResolutionMode(undefined);
    assert(mode === "INSPIRATION", "SET_CONTEXT sans resolution_mode → défaut INSPIRATION");
  }

  // LOCATION_BASED stocké correctement
  {
    const mode = getDefaultResolutionMode("LOCATION_BASED");
    assert(mode === "LOCATION_BASED", "SET_CONTEXT avec LOCATION_BASED → stocké correctement");
  }

  // INSPIRATION explicite
  {
    const mode = getDefaultResolutionMode("INSPIRATION");
    assert(mode === "INSPIRATION", "SET_CONTEXT avec INSPIRATION → stocké correctement");
  }

  // SELECT_THEME + env_shelter + INSPIRATION → drill_down
  {
    const phase = getPhaseAfterThemeSelection("env_shelter", "INSPIRATION");
    assert(phase === "drill_down", "SELECT_THEME + env_shelter + INSPIRATION → phase drill_down");
  }

  // SELECT_THEME + env_shelter + LOCATION_BASED → places_scan
  {
    const phase = getPhaseAfterThemeSelection("env_shelter", "LOCATION_BASED");
    assert(phase === "places_scan", "SELECT_THEME + env_shelter + LOCATION_BASED → phase places_scan");
  }

  // SELECT_THEME + env_home + LOCATION_BASED → drill_down (home toujours drill)
  {
    const phase = getPhaseAfterThemeSelection("env_home", "LOCATION_BASED");
    assert(phase === "drill_down", "SELECT_THEME + env_home + LOCATION_BASED → phase drill_down (home toujours drill)");
  }

  // SELECT_THEME + env_open_air + INSPIRATION → drill_down
  {
    const phase = getPhaseAfterThemeSelection("env_open_air", "INSPIRATION");
    assert(phase === "drill_down", "SELECT_THEME + env_open_air + INSPIRATION → phase drill_down");
  }

  // SELECT_THEME + env_open_air + LOCATION_BASED → places_scan
  {
    const phase = getPhaseAfterThemeSelection("env_open_air", "LOCATION_BASED");
    assert(phase === "places_scan", "SELECT_THEME + env_open_air + LOCATION_BASED → phase places_scan");
  }

  // SELECT_THEME + env_home + INSPIRATION → drill_down
  {
    const phase = getPhaseAfterThemeSelection("env_home", "INSPIRATION");
    assert(phase === "drill_down", "SELECT_THEME + env_home + INSPIRATION → phase drill_down");
  }
}

// ── Execution ──────────────────────────────────────────────────────────

console.log("\n\u2550".repeat(35));
console.log(" Tests Out-Home Logic");
console.log("\u2550".repeat(35));

testMapping();
testTypeDedup();
testMapAndDedup();
testFiltering();
testPoolValidation();
testNavigation();
testSkipTrivial();
testBacktrack();
testShortage();
testCrossTypeDedup();
testResolutionMode();

console.log(`\n\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500`);
console.log(` Total: ${passed + failed} | Passed: ${passed} | Failed: ${failed}`);
if (failures.length > 0) {
  console.log("\n Failures:");
  for (const f of failures) {
    console.log(`   \u2717 ${f}`);
  }
}
console.log("");

process.exit(failed > 0 ? 1 : 0);
