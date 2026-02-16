#!/usr/bin/env npx tsx
/**
 * Tests unitaires pour le Vigile (filter-service).
 *
 * Couvre :
 *   - Filtre open_now
 *   - Filtre rating
 *   - Combinaisons multiples
 *   - Edge cases
 *
 * Usage :
 *   npx tsx scripts/test-vigile.ts
 */

import { filterPlaces } from "../supabase/functions/_shared/filter-service.ts";
import type { Place } from "../supabase/functions/_shared/activity-provider.ts";
import type { FilterCriteria } from "../supabase/functions/_shared/filter-service.ts";

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
// Fixtures
// ---------------------------------------------------------------------------

function makePlace(overrides: Partial<Place> = {}): Place {
  return {
    place_id: `place-${Math.random().toString(36).slice(2, 8)}`,
    name: "Test Place",
    types: ["restaurant"],
    geometry: { location: { lat: 48.85, lng: 2.35 } },
    ...overrides,
  };
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

function runTests() {
  console.log("\n═══ Tests Vigile — Filter Service ═══\n");

  // ── 1. Filtre open_now ──────────────────────────────────────────────
  console.log("  — 1. Filtre open_now —");

  {
    const openPlace = makePlace({ opening_hours: { open_now: true } });
    const closedPlace = makePlace({ opening_hours: { open_now: false } });
    const noHoursPlace = makePlace({});

    const result = filterPlaces([openPlace, closedPlace, noHoursPlace], { requireOpenNow: true });
    assert(result.length === 2, "open_now=true → garde ouvert + sans horaires", `obtenu: ${result.length}`);
    assert(result.includes(openPlace), "Place ouverte gardée");
    assert(!result.includes(closedPlace), "Place fermée exclue");
    assert(result.includes(noHoursPlace), "Place sans horaires gardée (permissif)");
  }

  {
    const closedPlace = makePlace({ opening_hours: { open_now: false } });
    const result = filterPlaces([closedPlace], { requireOpenNow: false });
    assert(result.length === 1, "open_now=false → garde tout", `obtenu: ${result.length}`);
  }

  // ── 2. Filtre rating ────────────────────────────────────────────────
  console.log("\n  — 2. Filtre rating —");

  {
    const highRated = makePlace({ rating: 4.5 });
    const exactMin = makePlace({ rating: 4.0 });
    const lowRated = makePlace({ rating: 3.5 });
    const noRating = makePlace({});

    const result = filterPlaces([highRated, exactMin, lowRated, noRating], { minRating: 4.0 });
    assert(result.length === 3, "minRating=4.0 → 3 résultats (4.5, 4.0, absent)", `obtenu: ${result.length}`);
    assert(result.includes(highRated), "Rating 4.5 gardée");
    assert(result.includes(exactMin), "Rating 4.0 exact gardée (inclusive)");
    assert(!result.includes(lowRated), "Rating 3.5 exclue");
    assert(result.includes(noRating), "Rating absent → gardé (permissif)");
  }

  // ── 3. Combinaisons ─────────────────────────────────────────────────
  console.log("\n  — 3. Combinaisons —");

  {
    // Tous filtres actifs
    const good = makePlace({
      opening_hours: { open_now: true },
      rating: 4.2,
    });
    const badRating = makePlace({
      opening_hours: { open_now: true },
      rating: 3.0,
    });
    const closed = makePlace({
      opening_hours: { open_now: false },
      rating: 5.0,
    });

    const result = filterPlaces([good, badRating, closed], {
      requireOpenNow: true,
      minRating: 4.0,
    });
    assert(result.length === 1, "Tous filtres actifs → 1 résultat", `obtenu: ${result.length}`);
    assert(result[0] === good, "Seule la bonne place passe tous les filtres");
  }

  {
    // Aucun filtre
    const places = [makePlace(), makePlace(), makePlace()];
    const result = filterPlaces(places, {});
    assert(result.length === 3, "Aucun filtre → tout passe", `obtenu: ${result.length}`);
  }

  {
    // Liste vide
    const result = filterPlaces([], { requireOpenNow: true, minRating: 4.0 });
    assert(result.length === 0, "Liste vide → vide");
  }

  {
    // Tous filtrés
    const bad1 = makePlace({ rating: 1.0 });
    const bad2 = makePlace({ rating: 2.0 });
    const result = filterPlaces([bad1, bad2], { minRating: 4.0 });
    assert(result.length === 0, "Tous filtrés → vide");
  }

  // ── 4. Edge cases ───────────────────────────────────────────────────
  console.log("\n  — 4. Edge cases —");

  {
    // rating 4.0 exact → gardé (inclusive, >=)
    const exact = makePlace({ rating: 4.0 });
    const result = filterPlaces([exact], { minRating: 4.0 });
    assert(result.length === 1, "Rating 4.0 exact → gardé (inclusive)", `obtenu: ${result.length}`);
  }

  // ── Résumé ──────────────────────────────────────────────────────────
  console.log(`\n${"─".repeat(50)}`);
  console.log(`  Vigile : ${passed} passed, ${failed} failed`);
  if (failures.length > 0) {
    console.log("\n  Échecs :");
    failures.forEach((f) => console.log(`    • ${f}`));
  }
  console.log();

  process.exit(failed > 0 ? 1 : 0);
}

runTests();
