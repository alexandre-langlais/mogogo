#!/usr/bin/env npx tsx
/**
 * Tests unitaires pour le système de quotas anti-churning.
 *
 * Couvre :
 *   1. Première utilisation → allowed, scansUsed = 1
 *   2. 60 utilisations → toutes allowed
 *   3. 61ème utilisation → blocked
 *   4. Même original_app_user_id, différents user_ids Supabase → compteur partagé
 *   5. Deux original_app_user_id différents → compteurs indépendants
 *   6. Reset mensuel → compteur revient à 0
 *   7. Limite custom (ex: 5) respectée
 *   8. Lecture usage 0 pour ID inconnu
 *
 * Usage :
 *   npx tsx scripts/test-quota.ts
 */

import { QuotaEngine, QUOTA } from "./lib/quota-engine.js";

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
  console.log("\n═══ Tests Quota Anti-Churning ═══\n");

  const engine = new QuotaEngine();

  // ── 1. Première utilisation ───────────────────────────────────────────
  console.log("  — 1. Première utilisation —");

  {
    engine.reset();
    const result = engine.checkAndIncrement("rc_user_001");
    assert(result.allowed === true, "Première utilisation → allowed: true", `obtenu: ${result.allowed}`);
    assert(result.scans_used === 1, "Première utilisation → scansUsed: 1", `obtenu: ${result.scans_used}`);
    assert(result.scans_limit === QUOTA.MONTHLY_LIMIT, `Limite par défaut = ${QUOTA.MONTHLY_LIMIT}`, `obtenu: ${result.scans_limit}`);
  }

  // ── 2. 60 utilisations → toutes allowed ──────────────────────────────
  console.log("  — 2. 60 utilisations consécutives —");

  {
    engine.reset();
    let allAllowed = true;
    for (let i = 0; i < 60; i++) {
      const r = engine.checkAndIncrement("rc_user_002");
      if (!r.allowed) allAllowed = false;
    }
    assert(allAllowed, "60 utilisations → toutes allowed");

    const usage = engine.getUsage("rc_user_002");
    assert(usage === 60, "Usage après 60 scans = 60", `obtenu: ${usage}`);
  }

  // ── 3. 61ème utilisation → blocked ────────────────────────────────────
  console.log("  — 3. 61ème utilisation bloquée —");

  {
    // Continuer après les 60 du test précédent
    const result = engine.checkAndIncrement("rc_user_002");
    assert(result.allowed === false, "61ème utilisation → allowed: false", `obtenu: ${result.allowed}`);
    assert(result.scans_used === 60, "61ème → scansUsed reste à 60", `obtenu: ${result.scans_used}`);
    assert(result.scans_limit === 60, "61ème → scansLimit = 60", `obtenu: ${result.scans_limit}`);

    // Le compteur ne bouge pas
    const usage = engine.getUsage("rc_user_002");
    assert(usage === 60, "Usage inchangé après tentative bloquée", `obtenu: ${usage}`);
  }

  {
    // Tentatives supplémentaires → toujours bloqué
    const r2 = engine.checkAndIncrement("rc_user_002");
    const r3 = engine.checkAndIncrement("rc_user_002");
    assert(r2.allowed === false, "62ème tentative → bloquée");
    assert(r3.allowed === false, "63ème tentative → bloquée");
    assert(engine.getUsage("rc_user_002") === 60, "Usage toujours 60 après tentatives");
  }

  // ── 4. Même original_app_user_id, différents user_ids Supabase ──────
  console.log("  — 4. Même original_app_user_id (anti-churning) —");

  {
    engine.reset();
    const rcId = "rc_stable_apple_123";

    // Premier compte Supabase
    const r1 = engine.checkAndIncrement(rcId);
    assert(r1.allowed === true, "User A (compte 1) → scan 1 allowed", `scansUsed: ${r1.scans_used}`);

    const r2 = engine.checkAndIncrement(rcId);
    assert(r2.allowed === true, "User A (compte 1) → scan 2 allowed", `scansUsed: ${r2.scans_used}`);

    // Simulation : user supprime son compte et en recrée un (nouveau user_id Supabase)
    // Mais l'original_app_user_id RevenueCat reste le même
    const r3 = engine.checkAndIncrement(rcId);
    assert(r3.scans_used === 3, "User A (compte 2, même RC ID) → compteur continue à 3", `obtenu: ${r3.scans_used}`);

    // Vérifier que le compteur est bien cumulé
    assert(engine.getUsage(rcId) === 3, "Usage total = 3 malgré 'nouveau' compte");
  }

  // ── 5. Deux original_app_user_id différents → indépendants ──────────
  console.log("  — 5. Compteurs indépendants par original_app_user_id —");

  {
    engine.reset();
    const userA = "rc_user_alice";
    const userB = "rc_user_bob";

    // Alice fait 5 scans
    for (let i = 0; i < 5; i++) engine.checkAndIncrement(userA);
    // Bob fait 3 scans
    for (let i = 0; i < 3; i++) engine.checkAndIncrement(userB);

    assert(engine.getUsage(userA) === 5, "Alice: usage = 5", `obtenu: ${engine.getUsage(userA)}`);
    assert(engine.getUsage(userB) === 3, "Bob: usage = 3", `obtenu: ${engine.getUsage(userB)}`);

    // Alice épuise son quota (55 de plus)
    for (let i = 0; i < 55; i++) engine.checkAndIncrement(userA);
    const aliceBlocked = engine.checkAndIncrement(userA);
    assert(aliceBlocked.allowed === false, "Alice bloquée à 60");

    // Bob peut toujours scanner
    const bobOk = engine.checkAndIncrement(userB);
    assert(bobOk.allowed === true, "Bob non affecté par Alice", `scansUsed: ${bobOk.scans_used}`);
  }

  // ── 6. Reset mensuel ─────────────────────────────────────────────────
  console.log("  — 6. Reset mensuel —");

  {
    engine.reset();
    const rcId = "rc_monthly_user";

    // Remplir 60 scans
    for (let i = 0; i < 60; i++) engine.checkAndIncrement(rcId);
    const blocked = engine.checkAndIncrement(rcId);
    assert(blocked.allowed === false, "Mois courant: bloqué à 60");

    // Simuler le passage au mois suivant
    const lastMonth = new Date();
    lastMonth.setMonth(lastMonth.getMonth() - 1);
    lastMonth.setDate(1);
    lastMonth.setHours(0, 0, 0, 0);
    engine.setPeriodStart(rcId, lastMonth);

    // Nouveau mois → compteur reset
    const afterReset = engine.checkAndIncrement(rcId);
    assert(afterReset.allowed === true, "Nouveau mois → allowed: true");
    assert(afterReset.scans_used === 1, "Nouveau mois → scansUsed reset à 1", `obtenu: ${afterReset.scans_used}`);
  }

  {
    // Reset mensuel : vérifier que le compteur est bien à 0 avant
    engine.reset();
    const rcId = "rc_monthly_check";

    // 10 scans ce mois-ci
    for (let i = 0; i < 10; i++) engine.checkAndIncrement(rcId);
    assert(engine.getUsage(rcId) === 10, "10 scans ce mois");

    // Forcer le period_start au mois précédent
    const lastMonth = new Date();
    lastMonth.setMonth(lastMonth.getMonth() - 1);
    engine.setPeriodStart(rcId, lastMonth);

    // Le prochain check reset le compteur
    const r = engine.checkAndIncrement(rcId);
    assert(r.scans_used === 1, "Après reset mensuel → scansUsed = 1 (pas 11)", `obtenu: ${r.scans_used}`);
  }

  // ── 7. Limite custom ─────────────────────────────────────────────────
  console.log("  — 7. Limite custom —");

  {
    engine.reset();
    const rcId = "rc_custom_limit";

    // Limite de 5
    for (let i = 0; i < 5; i++) {
      const r = engine.checkAndIncrement(rcId, 5);
      assert(r.allowed === true, `Custom limit: scan ${i + 1}/5 → allowed`);
    }

    const blocked = engine.checkAndIncrement(rcId, 5);
    assert(blocked.allowed === false, "Custom limit: scan 6/5 → blocked");
    assert(blocked.scans_used === 5, "Custom limit: usage = 5", `obtenu: ${blocked.scans_used}`);
    assert(blocked.scans_limit === 5, "Custom limit: limit = 5", `obtenu: ${blocked.scans_limit}`);
  }

  {
    // Limite de 1 (cas extrême)
    engine.reset();
    const r1 = engine.checkAndIncrement("rc_limit1", 1);
    assert(r1.allowed === true, "Limite 1: premier scan → allowed");
    const r2 = engine.checkAndIncrement("rc_limit1", 1);
    assert(r2.allowed === false, "Limite 1: deuxième scan → blocked");
  }

  // ── 8. Lecture usage pour ID inconnu ──────────────────────────────────
  console.log("  — 8. ID inconnu —");

  {
    engine.reset();
    const usage = engine.getUsage("rc_unknown");
    assert(usage === 0, "ID inconnu → usage = 0", `obtenu: ${usage}`);
  }

  // ── 9. getQuotaInfo (lecture seule) ──────────────────────────────────
  console.log("  — 9. getQuotaInfo (lecture seule) —");

  {
    engine.reset();
    const rcId = "rc_info_user";

    // Aucune entrée → 0 usage
    const info0 = engine.getQuotaInfo(rcId);
    assert(info0.scans_used === 0, "getQuotaInfo: pas d'entrée → scansUsed = 0");
    assert(info0.scans_limit === 60, "getQuotaInfo: limite par défaut = 60");
    assert(info0.resets_at instanceof Date, "getQuotaInfo: resets_at est une Date");

    // Après 5 scans
    for (let i = 0; i < 5; i++) engine.checkAndIncrement(rcId);
    const info5 = engine.getQuotaInfo(rcId);
    assert(info5.scans_used === 5, "getQuotaInfo: après 5 scans → scansUsed = 5", `obtenu: ${info5.scans_used}`);
    assert(info5.scans_limit === 60, "getQuotaInfo: limite toujours 60");

    // Vérifier que getQuotaInfo ne modifie pas le compteur
    const info5bis = engine.getQuotaInfo(rcId);
    assert(info5bis.scans_used === 5, "getQuotaInfo: lecture seule, compteur inchangé = 5");

    // Après épuisement
    for (let i = 0; i < 55; i++) engine.checkAndIncrement(rcId);
    const info60 = engine.getQuotaInfo(rcId);
    assert(info60.scans_used === 60, "getQuotaInfo: épuisé → scansUsed = 60", `obtenu: ${info60.scans_used}`);

    // Date de reset = 1er du mois prochain
    const now = new Date();
    const expectedReset = new Date(now.getFullYear(), now.getMonth() + 1, 1);
    assert(
      info60.resets_at.getFullYear() === expectedReset.getFullYear()
      && info60.resets_at.getMonth() === expectedReset.getMonth()
      && info60.resets_at.getDate() === 1,
      "getQuotaInfo: resets_at = 1er du mois prochain",
      `obtenu: ${info60.resets_at.toISOString()}`,
    );

    // Après reset mensuel → usage revient à 0
    const lastMonth = new Date();
    lastMonth.setMonth(lastMonth.getMonth() - 1);
    engine.setPeriodStart(rcId, lastMonth);
    const infoReset = engine.getQuotaInfo(rcId);
    assert(infoReset.scans_used === 0, "getQuotaInfo: après reset mensuel → scansUsed = 0");

    // Limite custom
    engine.reset();
    for (let i = 0; i < 3; i++) engine.checkAndIncrement("rc_info_custom", 5);
    const infoCustom = engine.getQuotaInfo("rc_info_custom", 5);
    assert(infoCustom.scans_used === 3, "getQuotaInfo: limite custom → scansUsed = 3");
    assert(infoCustom.scans_limit === 5, "getQuotaInfo: limite custom = 5");
  }

  // ── 10. Constantes ─────────────────────────────────────────────────────
  console.log("  — 10. Constantes —");

  assert(QUOTA.MONTHLY_LIMIT === 60, "QUOTA.MONTHLY_LIMIT = 60");
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------
runTests();

console.log(`\n${"=".repeat(50)}`);
const total = passed + failed;
if (failed === 0) {
  console.log(`Résultat : ${passed}/${total} passés ✓`);
} else {
  console.log(`Résultat : ${passed}/${total} passés, ${failed} échoué(s) ✗`);
  for (const f of failures) {
    console.log(`  ✗ ${f}`);
  }
}
console.log("");

process.exit(failed > 0 ? 1 : 0);
