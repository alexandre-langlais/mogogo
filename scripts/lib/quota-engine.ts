/**
 * QuotaEngine — Implémentation pure TypeScript de la RPC check_and_increment_quota.
 *
 * Simule l'état de la table subscription_quotas en mémoire pour permettre
 * des tests unitaires instantanés sans Supabase.
 *
 * Reproduit fidèlement la logique SQL de :
 *   - supabase/migrations/016_subscription_quotas.sql
 */

// ── Constantes ──────────────────────────────────────────────────────────

export const QUOTA = {
  MONTHLY_LIMIT: 60,
} as const;

// ── Types ───────────────────────────────────────────────────────────────

export interface QuotaRow {
  original_app_user_id: string;
  monthly_scans_used: number;
  period_start: Date;
  updated_at: Date;
}

export interface QuotaCheckResult {
  allowed: boolean;
  scans_used: number;
  scans_limit: number;
}

export interface QuotaUsageResult {
  scans_used: number;
  scans_limit: number;
  resets_at: Date;
}

// ── Engine ──────────────────────────────────────────────────────────────

export class QuotaEngine {
  private quotas = new Map<string, QuotaRow>();

  /**
   * Simule la RPC check_and_increment_quota :
   * - UPSERT : crée la ligne si absente, reset si nouveau mois
   * - Si compteur >= limite → allowed=false
   * - Sinon → incrémente et retourne allowed=true
   */
  checkAndIncrement(
    originalAppUserId: string,
    monthlyLimit: number = QUOTA.MONTHLY_LIMIT,
  ): QuotaCheckResult {
    const currentPeriod = new Date();
    currentPeriod.setDate(1);
    currentPeriod.setHours(0, 0, 0, 0);

    let entry = this.quotas.get(originalAppUserId);

    if (!entry) {
      // Nouvelle entrée
      entry = {
        original_app_user_id: originalAppUserId,
        monthly_scans_used: 0,
        period_start: currentPeriod,
        updated_at: new Date(),
      };
      this.quotas.set(originalAppUserId, entry);
    } else if (entry.period_start < currentPeriod) {
      // Nouveau mois → reset
      entry.monthly_scans_used = 0;
      entry.period_start = currentPeriod;
      entry.updated_at = new Date();
    }

    // Vérifier la limite
    if (entry.monthly_scans_used >= monthlyLimit) {
      return {
        allowed: false,
        scans_used: entry.monthly_scans_used,
        scans_limit: monthlyLimit,
      };
    }

    // Incrémenter
    entry.monthly_scans_used++;
    entry.updated_at = new Date();

    return {
      allowed: true,
      scans_used: entry.monthly_scans_used,
      scans_limit: monthlyLimit,
    };
  }

  /** Lecture du compteur actuel */
  getUsage(originalAppUserId: string): number {
    return this.quotas.get(originalAppUserId)?.monthly_scans_used ?? 0;
  }

  /**
   * Simule la RPC get_quota_usage (lecture seule, sans incrémenter).
   * Retourne le nombre de scans utilisés, la limite et la date de réinitialisation.
   */
  getQuotaInfo(
    originalAppUserId: string,
    monthlyLimit: number = QUOTA.MONTHLY_LIMIT,
  ): QuotaUsageResult {
    const currentPeriod = new Date();
    currentPeriod.setDate(1);
    currentPeriod.setHours(0, 0, 0, 0);

    const nextMonth = new Date(currentPeriod);
    nextMonth.setMonth(nextMonth.getMonth() + 1);

    const entry = this.quotas.get(originalAppUserId);

    if (!entry) {
      return { scans_used: 0, scans_limit: monthlyLimit, resets_at: nextMonth };
    }

    // Période ancienne → usage effectif = 0
    if (entry.period_start < currentPeriod) {
      return { scans_used: 0, scans_limit: monthlyLimit, resets_at: nextMonth };
    }

    const resetsAt = new Date(entry.period_start);
    resetsAt.setMonth(resetsAt.getMonth() + 1);

    return {
      scans_used: entry.monthly_scans_used,
      scans_limit: monthlyLimit,
      resets_at: resetsAt,
    };
  }

  /** Forcer le period_start à une date passée (pour tester le reset mensuel) */
  setPeriodStart(originalAppUserId: string, date: Date): void {
    const entry = this.quotas.get(originalAppUserId);
    if (entry) {
      entry.period_start = date;
    }
  }

  /** Inspection pour debug */
  inspect(originalAppUserId: string): QuotaRow | undefined {
    return this.quotas.get(originalAppUserId);
  }

  /** Reset complet (pour tests) */
  reset(): void {
    this.quotas.clear();
  }
}
