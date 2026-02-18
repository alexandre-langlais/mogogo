/**
 * FeedbackEngine — Implémentation pure TypeScript de la validation feedback.
 *
 * Simule la validation et le stockage en mémoire pour permettre
 * des tests unitaires instantanés sans Supabase.
 *
 * Reproduit la logique de :
 *   - supabase/migrations/022_create_app_feedback.sql
 *   - src/services/feedback.ts
 */

// ── Types ────────────────────────────────────────────────────────────────

export type FeedbackCategory = "feature" | "bug" | "content" | "other";

export const VALID_CATEGORIES: FeedbackCategory[] = ["feature", "bug", "content", "other"];

export const FEEDBACK_MAX_LENGTH = 2000;

export interface FeedbackRow {
  id: string;
  user_id: string;
  category: FeedbackCategory;
  message: string;
  device_info: Record<string, unknown> | null;
  created_at: Date;
  status: "new" | "reviewed" | "resolved";
}

export interface SubmitFeedbackParams {
  category: string;
  message: string;
  device_info?: Record<string, unknown> | null;
}

// ── Erreurs ──────────────────────────────────────────────────────────────

export class FeedbackValidationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "FeedbackValidationError";
  }
}

export class FeedbackAuthError extends Error {
  constructor() {
    super("User must be authenticated to submit feedback");
    this.name = "FeedbackAuthError";
  }
}

// ── Engine ────────────────────────────────────────────────────────────────

export class FeedbackEngine {
  private rows: FeedbackRow[] = [];
  private nextId = 1;

  /**
   * Soumet un feedback. Simule l'INSERT avec validation.
   * @param userId - null si non-authentifié (déclenche FeedbackAuthError)
   */
  submitFeedback(userId: string | null, params: SubmitFeedbackParams): FeedbackRow {
    // Auth check
    if (!userId) {
      throw new FeedbackAuthError();
    }

    // Validate category
    if (!VALID_CATEGORIES.includes(params.category as FeedbackCategory)) {
      throw new FeedbackValidationError(`Invalid category: ${params.category}`);
    }

    // Trim message
    const trimmed = params.message.trim();

    // Validate message non-empty
    if (trimmed.length === 0) {
      throw new FeedbackValidationError("Message must not be empty");
    }

    // Validate message length
    if (trimmed.length > FEEDBACK_MAX_LENGTH) {
      throw new FeedbackValidationError(`Message too long: ${trimmed.length} chars (max ${FEEDBACK_MAX_LENGTH})`);
    }

    const row: FeedbackRow = {
      id: `fb-${this.nextId++}`,
      user_id: userId,
      category: params.category as FeedbackCategory,
      message: trimmed,
      device_info: params.device_info ?? null,
      created_at: new Date(),
      status: "new",
    };

    this.rows.push(row);
    return row;
  }

  /**
   * Simule la politique RLS : un user ne peut voir que ses propres feedbacks.
   * En production, pas de SELECT du tout. Ici on l'expose pour tester l'isolation.
   */
  getFeedbacksForUser(userId: string): FeedbackRow[] {
    return this.rows.filter((r) => r.user_id === userId);
  }

  /** Retourne tous les feedbacks (vue admin, pas exposée en prod) */
  getAllFeedbacks(): FeedbackRow[] {
    return [...this.rows];
  }

  /** Reset complet (pour tests) */
  reset(): void {
    this.rows = [];
    this.nextId = 1;
  }
}
