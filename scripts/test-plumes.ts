#!/usr/bin/env npx tsx
/**
 * Tests unitaires "bulletproof" pour le système de plumes Mogogo.
 *
 * Couvre 8 use cases :
 *   1. Nouvel utilisateur (30 plumes)
 *   2. Consommation standard (-10)
 *   3. Refus pour solde insuffisant (9 plumes → NoPlumesError)
 *   4. Bonus quotidien (sécurité 24h)
 *   5. Récompense vidéo (+30 / +40 atomique)
 *   6. Mode premium (infini)
 *   7. Codes promos (THANKYOU +50, non-réutilisable)
 *   8. Achats RevenueCat (+100 plumes)
 *
 * Usage :
 *   npx tsx scripts/test-plumes.ts
 */

import { PlumesEngine, PLUMES, NoPlumesError } from "./lib/plumes-engine.js";

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
  console.log("\n═══ Tests Plumes — Logique Métier ═══\n");

  const engine = new PlumesEngine();

  // ── 1. Nouvel utilisateur (30 plumes par défaut) ──────────────────────
  console.log("  — 1. Nouvel utilisateur —");

  {
    const info = engine.getDevicePlumesInfo("new-device-001");
    assert(
      info.plumes_count === PLUMES.DEFAULT,
      `Nouvel utilisateur → ${PLUMES.DEFAULT} plumes`,
      `obtenu: ${info.plumes_count}`,
    );
    assert(
      info.is_premium === false,
      "Nouvel utilisateur → pas premium",
      `obtenu: ${info.is_premium}`,
    );
    assert(
      info.last_daily_reward_at === null,
      "Nouvel utilisateur → pas de daily reward antérieur",
      `obtenu: ${info.last_daily_reward_at}`,
    );
  }

  {
    // Vérification via getDevicePlumes (ancienne API)
    const count = engine.getDevicePlumes("new-device-002");
    assert(
      count === PLUMES.DEFAULT,
      `getDevicePlumes → ${PLUMES.DEFAULT} pour nouveau device`,
      `obtenu: ${count}`,
    );
  }

  // ── 2. Consommation standard (-10 plumes) ─────────────────────────────
  console.log("  — 2. Consommation standard —");

  {
    engine.reset();
    const deviceId = "consume-device-001";

    // Solde initial
    const before = engine.getDevicePlumes(deviceId);
    assert(before === 30, "Solde initial = 30", `obtenu: ${before}`);

    // Consommer 10
    const remaining = engine.consumePlumes(deviceId, PLUMES.SESSION_COST);
    assert(remaining === 20, "Après -10 → solde = 20", `obtenu: ${remaining}`);

    // Vérifier la cohérence
    const after = engine.getDevicePlumes(deviceId);
    assert(after === 20, "getDevicePlumes confirme solde = 20", `obtenu: ${after}`);

    // Deuxième consommation
    const remaining2 = engine.consumePlumes(deviceId, PLUMES.SESSION_COST);
    assert(remaining2 === 10, "Après 2ème -10 → solde = 10", `obtenu: ${remaining2}`);

    // Troisième consommation
    const remaining3 = engine.consumePlumes(deviceId, PLUMES.SESSION_COST);
    assert(remaining3 === 0, "Après 3ème -10 → solde = 0", `obtenu: ${remaining3}`);
  }

  // ── 3. Refus pour solde insuffisant ───────────────────────────────────
  console.log("  — 3. Refus solde insuffisant —");

  {
    engine.reset();
    const deviceId = "broke-device-001";

    // Mettre le device à 9 plumes (< 10)
    engine.getDevicePlumesInfo(deviceId); // auto-create avec 30
    engine.consumePlumes(deviceId, 21);   // 30 - 21 = 9

    const before = engine.getDevicePlumes(deviceId);
    assert(before === 9, "Setup: solde = 9 plumes", `obtenu: ${before}`);

    // Tenter de consommer 10 → doit échouer
    const result = engine.consumePlumes(deviceId, PLUMES.SESSION_COST);
    assert(result === -1, "9 plumes → consumePlumes retourne -1 (échec)", `obtenu: ${result}`);

    // Le solde n'a pas changé
    const after = engine.getDevicePlumes(deviceId);
    assert(after === 9, "Après échec → solde inchangé = 9", `obtenu: ${after}`);

    // Pré-check gate simule le 402
    const gate = engine.preCheckGate(deviceId, true);
    assert(gate === "no_plumes", "preCheckGate(willFinalize=true, 9 plumes) → no_plumes", `obtenu: ${gate}`);

    // Cas NoPlumesError côté client
    const noPlumesErr = new NoPlumesError(9);
    assert(noPlumesErr.name === "NoPlumesError", "NoPlumesError.name correct");
    assert(noPlumesErr.message.includes("9"), "NoPlumesError.message contient le solde");
  }

  {
    // Cas exactement 0 plumes
    engine.reset();
    const deviceId = "zero-device-001";
    engine.getDevicePlumesInfo(deviceId);
    engine.consumePlumes(deviceId, 30); // vider

    const result = engine.consumePlumes(deviceId, PLUMES.SESSION_COST);
    assert(result === -1, "0 plumes → consumePlumes retourne -1", `obtenu: ${result}`);

    const gate = engine.preCheckGate(deviceId, true);
    assert(gate === "no_plumes", "preCheckGate(0 plumes, willFinalize) → no_plumes");
  }

  {
    // Cas exactement 10 plumes → OK
    engine.reset();
    const deviceId = "exact-device-001";
    engine.getDevicePlumesInfo(deviceId);
    engine.consumePlumes(deviceId, 20); // 30 - 20 = 10

    const result = engine.consumePlumes(deviceId, PLUMES.SESSION_COST);
    assert(result === 0, "Exactement 10 plumes → consumePlumes retourne 0 (succès)", `obtenu: ${result}`);
  }

  // ── 4. Bonus quotidien (sécurité 24h) ─────────────────────────────────
  console.log("  — 4. Bonus quotidien (24h) —");

  {
    engine.reset();
    const deviceId = "daily-device-001";
    const baseTime = new Date("2026-02-14T10:00:00Z");

    // Premier claim → succès
    const result1 = engine.claimDailyReward(deviceId, baseTime);
    assert(result1 === 30 + PLUMES.DAILY_REWARD, "Premier daily → 30 + 10 = 40", `obtenu: ${result1}`);

    // Cas B : tentative 2h après → bloqué
    const twoHoursLater = new Date(baseTime.getTime() + 2 * 60 * 60 * 1000);
    const result2 = engine.claimDailyReward(deviceId, twoHoursLater);
    assert(result2 === -1, "2h après → bloqué (-1)", `obtenu: ${result2}`);

    // Solde inchangé après tentative bloquée
    const afterBlocked = engine.getDevicePlumes(deviceId);
    assert(afterBlocked === 40, "Solde inchangé après blocage = 40", `obtenu: ${afterBlocked}`);

    // Cas A : tentative 25h après → succès
    const twentyFiveHoursLater = new Date(baseTime.getTime() + 25 * 60 * 60 * 1000);
    const result3 = engine.claimDailyReward(deviceId, twentyFiveHoursLater);
    assert(result3 === 40 + PLUMES.DAILY_REWARD, "25h après → 40 + 10 = 50", `obtenu: ${result3}`);
  }

  {
    // Cas limite : exactement 24h → OK (>= pas >)
    engine.reset();
    const deviceId = "daily-exact-001";
    const baseTime = new Date("2026-02-14T10:00:00Z");

    engine.claimDailyReward(deviceId, baseTime);
    const exactly24h = new Date(baseTime.getTime() + 24 * 60 * 60 * 1000);
    const result = engine.claimDailyReward(deviceId, exactly24h);
    assert(result === 40 + PLUMES.DAILY_REWARD, "Exactement 24h → succès (40 + 10 = 50)", `obtenu: ${result}`);
  }

  {
    // Cas limite : 23h59 → bloqué
    engine.reset();
    const deviceId = "daily-almost-001";
    const baseTime = new Date("2026-02-14T10:00:00Z");

    engine.claimDailyReward(deviceId, baseTime);
    const almost24h = new Date(baseTime.getTime() + 23 * 60 * 60 * 1000 + 59 * 60 * 1000);
    const result = engine.claimDailyReward(deviceId, almost24h);
    assert(result === -1, "23h59 → bloqué (-1)", `obtenu: ${result}`);
  }

  // ── 5. Récompense vidéo (+30 / +40 atomique) ──────────────────────────
  console.log("  — 5. Récompense vidéo —");

  {
    engine.reset();
    const deviceId = "ad-device-001";

    // Solde initial = 30
    const before = engine.getDevicePlumes(deviceId);
    assert(before === 30, "Solde initial = 30", `obtenu: ${before}`);

    // Crédit +30 (récompense pub standard via header)
    const after30 = engine.creditPlumes(deviceId, PLUMES.AD_REWARD);
    assert(after30 === 60, "+30 (pub) → solde = 60", `obtenu: ${after30}`);
  }

  {
    // Crédit +40 (via résultat, scénario zero-plume)
    engine.reset();
    const deviceId = "ad-device-002";
    engine.getDevicePlumesInfo(deviceId);
    engine.consumePlumes(deviceId, 30); // vider → 0

    const before = engine.getDevicePlumes(deviceId);
    assert(before === 0, "Setup: solde = 0 plumes", `obtenu: ${before}`);

    const afterCredit = engine.creditPlumes(deviceId, 40);
    assert(afterCredit === 40, "+40 après 0 → solde = 40", `obtenu: ${afterCredit}`);

    // Puis consommation de session → solde = 30
    const afterConsume = engine.consumePlumes(deviceId, PLUMES.SESSION_COST);
    assert(afterConsume === 30, "Après consommation 10 → solde final = 30", `obtenu: ${afterConsume}`);
  }

  {
    // Atomicité : crédit suivi immédiatement d'un débit
    engine.reset();
    const deviceId = "ad-atomic-001";
    engine.getDevicePlumesInfo(deviceId);
    engine.consumePlumes(deviceId, 25); // 30 - 25 = 5

    // Le device a 5 plumes, insuffisant pour une session
    const gateBefore = engine.preCheckGate(deviceId, true);
    assert(gateBefore === "no_plumes", "5 plumes → gate bloqué avant crédit");

    // Crédit +30
    engine.creditPlumes(deviceId, PLUMES.AD_REWARD);
    const afterCredit = engine.getDevicePlumes(deviceId);
    assert(afterCredit === 35, "5 + 30 = 35", `obtenu: ${afterCredit}`);

    // Gate OK maintenant
    const gateAfter = engine.preCheckGate(deviceId, true);
    assert(gateAfter === "ok", "35 plumes → gate OK après crédit");

    // Consommation
    const remaining = engine.consumePlumes(deviceId, PLUMES.SESSION_COST);
    assert(remaining === 25, "35 - 10 = 25", `obtenu: ${remaining}`);
  }

  // ── 6. Mode premium (infini) ──────────────────────────────────────────
  console.log("  — 6. Mode premium (infini) —");

  {
    engine.reset();
    const deviceId = "premium-device-001";

    // Activer le premium
    engine.setDevicePremium(deviceId, true);

    const info = engine.getDevicePlumesInfo(deviceId);
    assert(info.is_premium === true, "Premium activé", `obtenu: ${info.is_premium}`);

    // consume_plumes retourne 999999 (jamais de débit)
    const result = engine.consumePlumes(deviceId, PLUMES.SESSION_COST);
    assert(result === 999999, "Premium → consumePlumes retourne 999999", `obtenu: ${result}`);

    // Simuler 100 sessions : le solde ne descend jamais
    const initialPlumes = engine.getDevicePlumes(deviceId);
    let all999999 = true;
    for (let i = 0; i < 100; i++) {
      const r = engine.consumePlumes(deviceId, PLUMES.SESSION_COST);
      if (r !== 999999) all999999 = false;
    }
    assert(all999999, "Premium : 100 consumePlumes → tous retournent 999999");
    const afterPlumes = engine.getDevicePlumes(deviceId);
    assert(
      afterPlumes === initialPlumes,
      `Premium : 100 sessions → solde inchangé (${initialPlumes})`,
      `obtenu: ${afterPlumes}`,
    );

    // Gate toujours OK
    const gate = engine.preCheckGate(deviceId, true);
    assert(gate === "ok", "Premium → gate toujours OK même avec willFinalize=true");

    // postFinalizeConsume ne débite pas
    const postResult = engine.postFinalizeConsume(deviceId, "finalisé", false, false);
    // Note: is_premium est sur le device, la méthode lit l'état
    assert(
      postResult.remaining === 999999,
      "Premium device → postFinalizeConsume ne débite pas",
      `remaining=${postResult.remaining}`,
    );
  }

  {
    // Premium via profilePremium (RevenueCat, pas device-level)
    engine.reset();
    const deviceId = "premium-profile-001";
    const gate = engine.preCheckGate(deviceId, true, true);
    assert(gate === "ok", "profilePremium=true → gate OK sans premium device-level");
  }

  {
    // Désactivation du premium → redevient normal
    engine.reset();
    const deviceId = "premium-toggle-001";
    engine.setDevicePremium(deviceId, true);

    let result = engine.consumePlumes(deviceId, PLUMES.SESSION_COST);
    assert(result === 999999, "Premium actif → 999999", `obtenu: ${result}`);

    engine.setDevicePremium(deviceId, false);
    result = engine.consumePlumes(deviceId, PLUMES.SESSION_COST);
    assert(result === 20, "Premium désactivé → consommation normale (30-10=20)", `obtenu: ${result}`);
  }

  // ── 7. Codes promos (THANKYOU +50, non-réutilisable) ──────────────────
  console.log("  — 7. Codes promos —");

  {
    engine.reset();
    engine.registerPromoCode("THANKYOU", 50);
    const deviceId = "promo-device-001";

    // Premier usage → OK
    const result1 = engine.redeemPromoCode(deviceId, "THANKYOU");
    assert(result1 === "ok", "THANKYOU première utilisation → ok", `obtenu: ${result1}`);

    // Vérifier le solde : 30 (default) + 50 = 80
    const plumes = engine.getDevicePlumes(deviceId);
    assert(plumes === 80, "Solde après THANKYOU → 30 + 50 = 80", `obtenu: ${plumes}`);

    // Deuxième usage → bloqué
    const result2 = engine.redeemPromoCode(deviceId, "THANKYOU");
    assert(result2 === "already_redeemed", "THANKYOU 2ème fois → already_redeemed", `obtenu: ${result2}`);

    // Solde inchangé
    const plumesAfter = engine.getDevicePlumes(deviceId);
    assert(plumesAfter === 80, "Solde inchangé après tentative doublon = 80", `obtenu: ${plumesAfter}`);
  }

  {
    // Code invalide
    engine.reset();
    const result = engine.redeemPromoCode("some-device", "FAKECODE");
    assert(result === "invalid_code", "Code invalide → invalid_code", `obtenu: ${result}`);
  }

  {
    // Même code, device différent → OK
    engine.reset();
    engine.registerPromoCode("THANKYOU", 50);

    const r1 = engine.redeemPromoCode("device-A", "THANKYOU");
    const r2 = engine.redeemPromoCode("device-B", "THANKYOU");
    assert(r1 === "ok", "Device A → THANKYOU ok");
    assert(r2 === "ok", "Device B → THANKYOU ok (différent device)");

    const pA = engine.getDevicePlumes("device-A");
    const pB = engine.getDevicePlumes("device-B");
    assert(pA === 80, "Device A: 30 + 50 = 80", `obtenu: ${pA}`);
    assert(pB === 80, "Device B: 30 + 50 = 80", `obtenu: ${pB}`);
  }

  {
    // Code promo casse-insensible
    engine.reset();
    engine.registerPromoCode("THANKYOU", 50);

    const r = engine.redeemPromoCode("case-device", "thankyou");
    assert(r === "ok", "Code minuscules 'thankyou' → ok (case-insensitive)");
  }

  {
    // Code premium (grant_premium=true)
    engine.reset();
    engine.registerPromoCode("BETATESTER", 0, true);

    const r = engine.redeemPromoCode("beta-device", "BETATESTER");
    assert(r === "ok", "BETATESTER → ok");

    const info = engine.getDevicePlumesInfo("beta-device");
    assert(info.is_premium === true, "BETATESTER → is_premium=true", `obtenu: ${info.is_premium}`);
  }

  // ── 8. Achats RevenueCat (+100 plumes) ────────────────────────────────
  console.log("  — 8. Achats RevenueCat —");

  {
    engine.reset();
    const deviceId = "iap-device-001";

    // Solde initial
    const before = engine.getDevicePlumes(deviceId);
    assert(before === 30, "Solde initial = 30", `obtenu: ${before}`);

    // Simuler achat Petit Sac (100 plumes)
    const afterSmall = engine.creditPlumes(deviceId, PLUMES.PACK_SMALL);
    assert(afterSmall === 130, "Après Petit Sac (+100) → 130", `obtenu: ${afterSmall}`);

    // Simuler achat Grand Coffre (300 plumes)
    const afterBig = engine.creditPlumes(deviceId, PLUMES.PACK_LARGE);
    assert(afterBig === 430, "Après Grand Coffre (+300) → 430", `obtenu: ${afterBig}`);

    // Vérification cohérence
    const total = engine.getDevicePlumes(deviceId);
    assert(total === 430, "getDevicePlumes confirme 430", `obtenu: ${total}`);
  }

  {
    // Multiple achats successifs
    engine.reset();
    const deviceId = "iap-multi-001";

    engine.creditPlumes(deviceId, PLUMES.PACK_SMALL); // +100
    engine.creditPlumes(deviceId, PLUMES.PACK_SMALL); // +100
    engine.creditPlumes(deviceId, PLUMES.PACK_LARGE); // +300

    const total = engine.getDevicePlumes(deviceId);
    assert(total === 530, "30 + 100 + 100 + 300 = 530", `obtenu: ${total}`);
  }

  // ── 9. Scénarios end-to-end composites ────────────────────────────────
  console.log("  — 9. Scénarios E2E composites —");

  {
    // Scénario complet : nouveau user → 3 sessions → 0 plumes → pub → session → daily
    engine.reset();
    const deviceId = "e2e-user-001";

    // Début : 30 plumes
    let bal = engine.getDevicePlumes(deviceId);
    assert(bal === 30, "E2E: début 30 plumes");

    // Session 1 : gate OK, consomme 10
    assert(engine.preCheckGate(deviceId, true) === "ok", "E2E: session 1 gate OK");
    engine.postFinalizeConsume(deviceId, "finalisé", false);
    bal = engine.getDevicePlumes(deviceId);
    assert(bal === 20, "E2E: après session 1 → 20", `obtenu: ${bal}`);

    // Session 2 : gate OK, consomme 10
    assert(engine.preCheckGate(deviceId, true) === "ok", "E2E: session 2 gate OK");
    engine.postFinalizeConsume(deviceId, "finalisé", false);
    bal = engine.getDevicePlumes(deviceId);
    assert(bal === 10, "E2E: après session 2 → 10", `obtenu: ${bal}`);

    // Session 3 : gate OK, consomme 10
    assert(engine.preCheckGate(deviceId, true) === "ok", "E2E: session 3 gate OK");
    engine.postFinalizeConsume(deviceId, "finalisé", false);
    bal = engine.getDevicePlumes(deviceId);
    assert(bal === 0, "E2E: après session 3 → 0", `obtenu: ${bal}`);

    // Session 4 : gate bloqué → 402
    assert(engine.preCheckGate(deviceId, true) === "no_plumes", "E2E: session 4 gate → no_plumes");

    // Regarder une pub → +30
    engine.creditPlumes(deviceId, PLUMES.AD_REWARD);
    bal = engine.getDevicePlumes(deviceId);
    assert(bal === 30, "E2E: après pub → 30", `obtenu: ${bal}`);

    // Session 5 : gate OK, consomme 10
    assert(engine.preCheckGate(deviceId, true) === "ok", "E2E: session 5 gate OK");
    engine.postFinalizeConsume(deviceId, "finalisé", false);
    bal = engine.getDevicePlumes(deviceId);
    assert(bal === 20, "E2E: après session 5 → 20", `obtenu: ${bal}`);

    // Daily bonus
    engine.claimDailyReward(deviceId);
    bal = engine.getDevicePlumes(deviceId);
    assert(bal === 30, "E2E: après daily → 30", `obtenu: ${bal}`);
  }

  {
    // Scénario reroll : consommation uniquement au premier finalisé, pas au reroll
    engine.reset();
    const deviceId = "e2e-reroll-001";

    // Premier finalisé → débit
    const r1 = engine.postFinalizeConsume(deviceId, "finalisé", false);
    assert(r1.consumed === true, "E2E reroll: premier finalisé → consumed=true");
    assert(engine.getDevicePlumes(deviceId) === 20, "E2E reroll: solde = 20");

    // Reroll (hadRefineOrReroll=true) → pas de débit supplémentaire
    const r2 = engine.postFinalizeConsume(deviceId, "finalisé", true);
    assert(r2.consumed === false, "E2E reroll: reroll → consumed=false");
    assert(engine.getDevicePlumes(deviceId) === 20, "E2E reroll: solde inchangé = 20");
  }

  {
    // Scénario refine : pas de débit sur refine + re-finalisation
    engine.reset();
    const deviceId = "e2e-refine-001";

    // Premier finalisé → débit
    engine.postFinalizeConsume(deviceId, "finalisé", false);
    assert(engine.getDevicePlumes(deviceId) === 20, "E2E refine: après premier finalisé → 20");

    // Refine → le user revient dans le funnel, hadRefineOrReroll=true
    // Quand il re-finalise, pas de re-débit
    engine.postFinalizeConsume(deviceId, "finalisé", true);
    assert(engine.getDevicePlumes(deviceId) === 20, "E2E refine: après re-finalisé (post-refine) → 20 (pas de re-débit)");
  }

  {
    // Scénario erreur LLM : statut absent → pas de débit
    engine.reset();
    const deviceId = "e2e-error-001";

    // Erreur LLM → statut !== "finalisé"
    const r = engine.postFinalizeConsume(deviceId, "en_cours", false);
    assert(r.consumed === false, "E2E erreur: statut en_cours → pas de débit");
    assert(engine.getDevicePlumes(deviceId) === 30, "E2E erreur: solde inchangé = 30");
  }

  // ── 10. Vérification des constantes ───────────────────────────────────
  console.log("  — 10. Constantes d'économie —");

  assert(PLUMES.DEFAULT === 30, "PLUMES.DEFAULT = 30");
  assert(PLUMES.SESSION_COST === 10, "PLUMES.SESSION_COST = 10");
  assert(PLUMES.AD_REWARD === 30, "PLUMES.AD_REWARD = 30");
  assert(PLUMES.DAILY_REWARD === 10, "PLUMES.DAILY_REWARD = 10");
  assert(PLUMES.PACK_SMALL === 100, "PLUMES.PACK_SMALL = 100");
  assert(PLUMES.PACK_LARGE === 300, "PLUMES.PACK_LARGE = 300");
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
