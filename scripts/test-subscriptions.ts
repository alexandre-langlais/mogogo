#!/usr/bin/env npx tsx
/**
 * Tests unitaires pour la logique subscriptions (services d'abonnement).
 *
 * Couvre :
 *   - Toggle on/off
 *   - Doublons impossibles
 *   - Slug invalide → erreur
 *   - Liste vide
 *   - Formatage LLM (vide → "", rempli → texte structuré)
 *   - Isolation par user
 *
 * Usage :
 *   npx tsx scripts/test-subscriptions.ts
 */

import {
  SubscriptionsEngine,
  SERVICES_CATALOG,
  VALID_SLUGS,
  InvalidSlugError,
  formatSubscriptionsForLLM,
} from "./lib/subscriptions-engine.js";

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
// Tests
// ---------------------------------------------------------------------------

function runTests() {
  console.log("\n═══ Tests Subscriptions — Logique Métier ═══\n");

  const engine = new SubscriptionsEngine();

  // ── 1. Catalogue valide ────────────────────────────────────────────────
  console.log("  — 1. Catalogue —");
  {
    assert(SERVICES_CATALOG.video.length > 0, "Catalogue vidéo non vide");
    assert(SERVICES_CATALOG.music.length > 0, "Catalogue musique non vide");
    assert(VALID_SLUGS.has("netflix"), "netflix dans les slugs valides");
    assert(VALID_SLUGS.has("spotify"), "spotify dans les slugs valides");
    assert(!VALID_SLUGS.has("hbo_max"), "hbo_max absent des slugs valides");
  }

  // ── 2. Liste vide par défaut ───────────────────────────────────────────
  console.log("\n  — 2. Liste vide —");
  {
    const services = engine.getServices("user-001");
    assert(services.length === 0, "Nouvel utilisateur → 0 services", `obtenu: ${services.length}`);
  }

  // ── 3. Toggle on ──────────────────────────────────────────────────────
  console.log("\n  — 3. Toggle on —");
  {
    const result = engine.toggleService("user-001", "netflix");
    assert(result.includes("netflix"), "Toggle on netflix → inclus dans la liste");
    assert(result.length === 1, "Toggle on → 1 service", `obtenu: ${result.length}`);
  }

  // ── 4. Toggle on deuxième service ─────────────────────────────────────
  console.log("\n  — 4. Toggle on 2e service —");
  {
    const result = engine.toggleService("user-001", "spotify");
    assert(result.includes("netflix"), "netflix toujours présent");
    assert(result.includes("spotify"), "spotify ajouté");
    assert(result.length === 2, "2 services après 2 toggles on", `obtenu: ${result.length}`);
  }

  // ── 5. Toggle off ─────────────────────────────────────────────────────
  console.log("\n  — 5. Toggle off —");
  {
    const result = engine.toggleService("user-001", "netflix");
    assert(!result.includes("netflix"), "Toggle off netflix → retiré");
    assert(result.includes("spotify"), "spotify toujours présent");
    assert(result.length === 1, "1 service après toggle off", `obtenu: ${result.length}`);
  }

  // ── 6. Pas de doublons ────────────────────────────────────────────────
  console.log("\n  — 6. Pas de doublons —");
  {
    // Toggle on spotify → le retire (car déjà présent)
    engine.toggleService("user-001", "spotify"); // off
    engine.toggleService("user-001", "spotify"); // on
    const services = engine.getServices("user-001");
    const spotifyCount = services.filter(s => s === "spotify").length;
    assert(spotifyCount <= 1, "Pas de doublon spotify", `count: ${spotifyCount}`);
  }

  // ── 7. Slug invalide ──────────────────────────────────────────────────
  console.log("\n  — 7. Slug invalide —");
  {
    let thrown = false;
    try {
      engine.toggleService("user-001", "hbo_max_inexistant");
    } catch (e) {
      thrown = e instanceof InvalidSlugError;
    }
    assert(thrown, "Slug invalide → InvalidSlugError");
  }

  // ── 8. Isolation par user ─────────────────────────────────────────────
  console.log("\n  — 8. Isolation par user —");
  {
    engine.reset();
    engine.toggleService("alice", "netflix");
    engine.toggleService("bob", "disney_plus");

    const alice = engine.getServices("alice");
    const bob = engine.getServices("bob");

    assert(alice.includes("netflix") && !alice.includes("disney_plus"), "Alice → seulement netflix");
    assert(bob.includes("disney_plus") && !bob.includes("netflix"), "Bob → seulement disney_plus");
  }

  // ── 9. Formatage LLM — vide ──────────────────────────────────────────
  console.log("\n  — 9. Formatage LLM vide —");
  {
    const result = formatSubscriptionsForLLM([]);
    assert(result === "", "Liste vide → chaîne vide", `obtenu: "${result}"`);
  }

  {
    const result = formatSubscriptionsForLLM(undefined as any);
    assert(result === "", "undefined → chaîne vide", `obtenu: "${result}"`);
  }

  // ── 10. Formatage LLM — rempli ────────────────────────────────────────
  console.log("\n  — 10. Formatage LLM rempli —");
  {
    const result = formatSubscriptionsForLLM(["netflix", "spotify"]);
    assert(result.includes("abonnements suivants"), "Contient 'abonnements suivants'", `obtenu: "${result.slice(0, 80)}"`);
    assert(result.includes("Netflix"), "Contient 'Netflix'");
    assert(result.includes("Spotify"), "Contient 'Spotify'");
    assert(result.includes("🎬"), "Contient l'emoji Netflix");
    assert(result.includes("🎵"), "Contient l'emoji Spotify");
  }

  // ── 11. Formatage LLM — slug inconnu ignoré ──────────────────────────
  console.log("\n  — 11. Formatage LLM slug inconnu ignoré —");
  {
    const result = formatSubscriptionsForLLM(["netflix", "inconnu_service"]);
    assert(result.includes("Netflix"), "Netflix présent");
    assert(!result.includes("inconnu_service"), "Slug inconnu ignoré");
  }

  // ── 12. Formatage LLM — tous des slugs inconnus ──────────────────────
  console.log("\n  — 12. Formatage LLM — tous inconnus —");
  {
    const result = formatSubscriptionsForLLM(["x", "y"]);
    assert(result === "", "Que des inconnus → chaîne vide");
  }

  // ── Résumé ──────────────────────────────────────────────────────────────
  console.log(`\n${"═".repeat(50)}`);
  console.log(`  Subscriptions : ${passed} passed, ${failed} failed`);
  if (failures.length > 0) {
    console.log("\n  Échecs :");
    failures.forEach((f) => console.log(`    • ${f}`));
  }
  console.log();

  process.exit(failed > 0 ? 1 : 0);
}

runTests();
