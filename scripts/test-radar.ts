#!/usr/bin/env npx tsx
/**
 * Tests unitaires pour le Radar (availability-guard).
 *
 * Couvre :
 *   - Disponibilité (0 vs N résultats)
 *   - Mock adapter
 *   - Intégration Vigile
 *   - Gestion erreurs
 *
 * Usage :
 *   npx tsx scripts/test-radar.ts
 */

import { checkAvailability } from "../supabase/functions/_shared/availability-guard.ts";
import type { IActivityProvider, Place, SearchCriteria } from "../supabase/functions/_shared/activity-provider.ts";
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

class MockProvider implements IActivityProvider {
  constructor(private result: Place[] | Error) {}
  async search(_criteria: SearchCriteria): Promise<Place[]> {
    if (this.result instanceof Error) throw this.result;
    return this.result;
  }
}

const defaultCriteria: SearchCriteria = {
  location: { lat: 48.85, lng: 2.35 },
  radius: 5000,
  types: ["restaurant"],
};

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

async function runTests() {
  console.log("\n═══ Tests Radar — Availability Guard ═══\n");

  // ── 1. Disponibilité basique ────────────────────────────────────────
  console.log("  — 1. Disponibilité —");

  {
    const provider = new MockProvider([]);
    const result = await checkAvailability(provider, {}, defaultCriteria);
    assert(result.available === false, "0 résultat → available=false");
    assert(result.count === 0, "0 résultat → count=0", `obtenu: ${result.count}`);
    assert(result.places.length === 0, "0 résultat → places vide");
  }

  {
    const place = makePlace();
    const provider = new MockProvider([place]);
    const result = await checkAvailability(provider, {}, defaultCriteria);
    assert(result.available === true, "1 résultat → available=true");
    assert(result.count === 1, "1 résultat → count=1", `obtenu: ${result.count}`);
    assert(result.places.length === 1, "1 résultat → 1 place");
  }

  {
    const places = [makePlace(), makePlace(), makePlace()];
    const provider = new MockProvider(places);
    const result = await checkAvailability(provider, {}, defaultCriteria);
    assert(result.available === true, "3 résultats → available=true");
    assert(result.count === 3, "3 résultats → count=3", `obtenu: ${result.count}`);
  }

  // ── 2. Intégration Vigile ───────────────────────────────────────────
  console.log("\n  — 2. Intégration Vigile —");

  {
    // 5 places brutes, 0 après filtrage rating
    const badPlaces = Array.from({ length: 5 }, () => makePlace({ rating: 2.0 }));
    const provider = new MockProvider(badPlaces);
    const result = await checkAvailability(provider, { minRating: 4.0 }, defaultCriteria);
    assert(result.available === false, "5 brutes, 0 après filtrage → false");
    assert(result.count === 0, "count=0 après filtrage", `obtenu: ${result.count}`);
  }

  {
    // 5 places, 3 passent le filtre rating
    const places = [
      makePlace({ rating: 4.5 }),
      makePlace({ rating: 4.2 }),
      makePlace({ rating: 3.0 }),
      makePlace({ rating: 4.0 }),
      makePlace({ rating: 2.5 }),
    ];
    const provider = new MockProvider(places);
    const result = await checkAvailability(provider, { minRating: 4.0 }, defaultCriteria);
    assert(result.available === true, "5 brutes, 3 après filtrage → true");
    assert(result.count === 3, "count=3 après filtrage", `obtenu: ${result.count}`);
  }

  {
    // Filtrage combiné : open_now + rating
    const places = [
      makePlace({ opening_hours: { open_now: true }, rating: 4.5 }),
      makePlace({ opening_hours: { open_now: false }, rating: 4.8 }),
      makePlace({ opening_hours: { open_now: true }, rating: 3.0 }),
      makePlace({ opening_hours: { open_now: true }, rating: 4.2 }),
    ];
    const provider = new MockProvider(places);
    const result = await checkAvailability(provider, { requireOpenNow: true, minRating: 4.0 }, defaultCriteria);
    assert(result.available === true, "Filtre combiné → available=true");
    assert(result.count === 2, "Filtre combiné → count=2", `obtenu: ${result.count}`);
  }

  // ── 3. Gestion erreurs ──────────────────────────────────────────────
  console.log("\n  — 3. Gestion erreurs —");

  {
    const provider = new MockProvider(new Error("Network timeout"));
    const result = await checkAvailability(provider, {}, defaultCriteria);
    assert(result.available === false, "Erreur réseau → available=false (graceful)");
    assert(result.count === 0, "Erreur réseau → count=0", `obtenu: ${result.count}`);
    assert(result.places.length === 0, "Erreur réseau → places vide");
  }

  {
    const provider = new MockProvider(new Error("API Key invalid"));
    const result = await checkAvailability(provider, {}, defaultCriteria);
    assert(result.available === false, "Erreur API → available=false (graceful)");
  }

  // ── Résumé ──────────────────────────────────────────────────────────
  console.log(`\n${"─".repeat(50)}`);
  console.log(`  Radar : ${passed} passed, ${failed} failed`);
  if (failures.length > 0) {
    console.log("\n  Échecs :");
    failures.forEach((f) => console.log(`    • ${f}`));
  }
  console.log();

  process.exit(failed > 0 ? 1 : 0);
}

runTests();
