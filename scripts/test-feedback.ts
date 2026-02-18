#!/usr/bin/env npx tsx
/**
 * Tests unitaires pour le système de feedback "Le Puits à Souhaits".
 *
 * Couvre :
 *   1. Soumission nominale (feature, bug, other, content)
 *   2. Message vide → erreur
 *   3. Message trop long → erreur
 *   4. Catégorie invalide → erreur
 *   5. Non-authentifié → erreur
 *   6. Trimming des espaces
 *   7. Isolation RLS (user A ne voit pas user B)
 *   8. Statut "new" par défaut
 *   9. device_info optionnel
 *
 * Usage :
 *   npx tsx scripts/test-feedback.ts
 */

import {
  FeedbackEngine,
  FeedbackValidationError,
  FeedbackAuthError,
  VALID_CATEGORIES,
  FEEDBACK_MAX_LENGTH,
} from "./lib/feedback-engine.js";

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

function assertThrows<E extends Error>(
  fn: () => void,
  errorClass: new (...args: any[]) => E,
  label: string,
): E | null {
  try {
    fn();
    assert(false, label, "expected error but none thrown");
    return null;
  } catch (err) {
    const isExpected = err instanceof errorClass;
    assert(isExpected, label, isExpected ? undefined : `got ${(err as Error).constructor.name}: ${(err as Error).message}`);
    return isExpected ? (err as E) : null;
  }
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

function runTests() {
  console.log("\n\u2550\u2550\u2550 Tests Feedback \u2014 Le Puits \u00e0 Souhaits \u2550\u2550\u2550\n");

  const engine = new FeedbackEngine();

  // \u2500\u2500 1. Soumission nominale \u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500
  console.log("  \u2014 1. Soumission nominale \u2014");

  {
    engine.reset();
    const row = engine.submitFeedback("user-001", {
      category: "feature",
      message: "J'aimerais un mode nuit",
    });
    assert(row.category === "feature", "Catégorie feature acceptée");
    assert(row.message === "J'aimerais un mode nuit", "Message préservé");
    assert(row.user_id === "user-001", "user_id correct");
    assert(row.id !== "", "id non-vide");
  }

  {
    engine.reset();
    const row = engine.submitFeedback("user-002", {
      category: "bug",
      message: "Le bouton ne fonctionne pas",
    });
    assert(row.category === "bug", "Catégorie bug acceptée");
  }

  {
    engine.reset();
    const row = engine.submitFeedback("user-003", {
      category: "other",
      message: "Bravo pour l'app !",
    });
    assert(row.category === "other", "Catégorie other acceptée");
  }

  {
    engine.reset();
    const row = engine.submitFeedback("user-004", {
      category: "content",
      message: "Plus de suggestions culturelles svp",
    });
    assert(row.category === "content", "Catégorie content acceptée");
  }

  // \u2500\u2500 2. Message vide \u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500
  console.log("  \u2014 2. Message vide \u2014");

  {
    engine.reset();
    assertThrows(
      () => engine.submitFeedback("user-001", { category: "feature", message: "" }),
      FeedbackValidationError,
      "Message vide \u2192 FeedbackValidationError",
    );
  }

  {
    engine.reset();
    assertThrows(
      () => engine.submitFeedback("user-001", { category: "feature", message: "   " }),
      FeedbackValidationError,
      "Message espaces uniquement \u2192 FeedbackValidationError",
    );
  }

  // \u2500\u2500 3. Message trop long \u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500
  console.log("  \u2014 3. Message trop long \u2014");

  {
    engine.reset();
    const longMessage = "a".repeat(FEEDBACK_MAX_LENGTH + 1);
    assertThrows(
      () => engine.submitFeedback("user-001", { category: "bug", message: longMessage }),
      FeedbackValidationError,
      `Message ${FEEDBACK_MAX_LENGTH + 1} chars \u2192 FeedbackValidationError`,
    );
  }

  {
    // Exactement la limite \u2192 OK
    engine.reset();
    const exactMessage = "b".repeat(FEEDBACK_MAX_LENGTH);
    const row = engine.submitFeedback("user-001", { category: "bug", message: exactMessage });
    assert(row.message.length === FEEDBACK_MAX_LENGTH, `Message exactement ${FEEDBACK_MAX_LENGTH} chars \u2192 OK`);
  }

  // \u2500\u2500 4. Catégorie invalide \u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500
  console.log("  \u2014 4. Catégorie invalide \u2014");

  {
    engine.reset();
    assertThrows(
      () => engine.submitFeedback("user-001", { category: "invalid", message: "test" }),
      FeedbackValidationError,
      "Catégorie 'invalid' \u2192 FeedbackValidationError",
    );
  }

  {
    engine.reset();
    assertThrows(
      () => engine.submitFeedback("user-001", { category: "", message: "test" }),
      FeedbackValidationError,
      "Catégorie vide \u2192 FeedbackValidationError",
    );
  }

  // \u2500\u2500 5. Non-authentifié \u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500
  console.log("  \u2014 5. Non-authentifié \u2014");

  {
    engine.reset();
    assertThrows(
      () => engine.submitFeedback(null, { category: "feature", message: "test" }),
      FeedbackAuthError,
      "userId null \u2192 FeedbackAuthError",
    );
  }

  // \u2500\u2500 6. Trimming \u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500
  console.log("  \u2014 6. Trimming \u2014");

  {
    engine.reset();
    const row = engine.submitFeedback("user-001", {
      category: "feature",
      message: "  Mon idée  \n  ",
    });
    assert(row.message === "Mon idée", "Trimming appliqué", `obtenu: "${row.message}"`);
  }

  // \u2500\u2500 7. Isolation RLS \u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500
  console.log("  \u2014 7. Isolation RLS \u2014");

  {
    engine.reset();
    engine.submitFeedback("user-A", { category: "feature", message: "Idée de A" });
    engine.submitFeedback("user-B", { category: "bug", message: "Bug de B" });
    engine.submitFeedback("user-A", { category: "other", message: "Autre de A" });

    const feedbacksA = engine.getFeedbacksForUser("user-A");
    const feedbacksB = engine.getFeedbacksForUser("user-B");

    assert(feedbacksA.length === 2, "User A voit ses 2 feedbacks", `obtenu: ${feedbacksA.length}`);
    assert(feedbacksB.length === 1, "User B voit son 1 feedback", `obtenu: ${feedbacksB.length}`);
    assert(
      feedbacksA.every((f) => f.user_id === "user-A"),
      "User A ne voit que ses propres feedbacks",
    );
    assert(
      feedbacksB.every((f) => f.user_id === "user-B"),
      "User B ne voit que ses propres feedbacks",
    );
  }

  // \u2500\u2500 8. Statut "new" par défaut \u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500
  console.log("  \u2014 8. Statut 'new' par défaut \u2014");

  {
    engine.reset();
    const row = engine.submitFeedback("user-001", {
      category: "feature",
      message: "Test statut",
    });
    assert(row.status === "new", "Statut par défaut = 'new'", `obtenu: ${row.status}`);
  }

  // \u2500\u2500 9. device_info optionnel \u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500
  console.log("  \u2014 9. device_info optionnel \u2014");

  {
    engine.reset();
    // Sans device_info
    const row1 = engine.submitFeedback("user-001", {
      category: "feature",
      message: "Sans device info",
    });
    assert(row1.device_info === null, "device_info absent \u2192 null");

    // Avec device_info
    const deviceInfo = { os: "android", version: "14", appVersion: "1.2.0" };
    const row2 = engine.submitFeedback("user-001", {
      category: "bug",
      message: "Avec device info",
      device_info: deviceInfo,
    });
    assert(row2.device_info !== null, "device_info présent");
    assert((row2.device_info as any).os === "android", "device_info.os = android");
  }

  // \u2500\u2500 10. Constantes \u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500
  console.log("  \u2014 10. Constantes \u2014");

  assert(VALID_CATEGORIES.length === 4, "4 catégories valides");
  assert(VALID_CATEGORIES.includes("feature"), "feature \u2208 VALID_CATEGORIES");
  assert(VALID_CATEGORIES.includes("bug"), "bug \u2208 VALID_CATEGORIES");
  assert(VALID_CATEGORIES.includes("content"), "content \u2208 VALID_CATEGORIES");
  assert(VALID_CATEGORIES.includes("other"), "other \u2208 VALID_CATEGORIES");
  assert(FEEDBACK_MAX_LENGTH === 2000, "FEEDBACK_MAX_LENGTH = 2000");
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------
runTests();

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
