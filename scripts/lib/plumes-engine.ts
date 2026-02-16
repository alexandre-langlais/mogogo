/**
 * PlumesEngine — Implémentation pure TypeScript des RPCs SQL de plumes.
 *
 * Simule l'état de la table device_plumes en mémoire pour permettre
 * des tests unitaires instantanés sans Supabase.
 *
 * Chaque méthode reproduit fidèlement la logique SQL de :
 *   - supabase/migrations/012_plumes_magiques.sql
 *   - supabase/migrations/013_plumes_economy.sql
 */

// ── Constantes d'économie (source de vérité) ────────────────────────────

export const PLUMES = {
  DEFAULT: 30,
  SESSION_COST: 10,
  AD_REWARD: 30,
  AD_REWARD_GATE: 30,
  DAILY_REWARD: 10,
  PACK_SMALL: 100,
  PACK_LARGE: 300,
} as const;

// ── Types ────────────────────────────────────────────────────────────────

export interface DeviceRow {
  device_id: string;
  plumes_count: number;
  is_premium: boolean;
  last_daily_reward_at: Date | null;
  updated_at: Date;
}

export interface PlumesInfo {
  plumes_count: number;
  last_daily_reward_at: Date | null;
  is_premium: boolean;
}

export interface PromoRedemption {
  device_id: string;
  code: string;
  redeemed_at: Date;
}

export interface PromoCode {
  code: string;
  bonus: number;
  grant_premium?: boolean;
}

// ── Erreurs ──────────────────────────────────────────────────────────────

export class NoPlumesError extends Error {
  constructor(plumes: number) {
    super(`Solde insuffisant : ${plumes} plumes (minimum ${PLUMES.SESSION_COST} requises)`);
    this.name = "NoPlumesError";
  }
}

// ── Engine ────────────────────────────────────────────────────────────────

export class PlumesEngine {
  private devices = new Map<string, DeviceRow>();
  private redemptions: PromoRedemption[] = [];
  private promoCodes = new Map<string, PromoCode>();

  // ── Configuration ──

  /** Enregistrer un code promo disponible */
  registerPromoCode(code: string, bonus: number, grantPremium = false): void {
    this.promoCodes.set(code.toUpperCase(), { code: code.toUpperCase(), bonus, grant_premium: grantPremium });
  }

  // ── Accès device (auto-create) ──

  private getOrCreateDevice(deviceId: string): DeviceRow {
    let row = this.devices.get(deviceId);
    if (!row) {
      row = {
        device_id: deviceId,
        plumes_count: PLUMES.DEFAULT,
        is_premium: false,
        last_daily_reward_at: null,
        updated_at: new Date(),
      };
      this.devices.set(deviceId, row);
    }
    return row;
  }

  // ── RPCs ──

  /** get_device_plumes_info : lecture (auto-create si absent) */
  getDevicePlumesInfo(deviceId: string): PlumesInfo {
    const row = this.getOrCreateDevice(deviceId);
    return {
      plumes_count: row.plumes_count,
      last_daily_reward_at: row.last_daily_reward_at,
      is_premium: row.is_premium,
    };
  }

  /** get_device_plumes : lecture simple */
  getDevicePlumes(deviceId: string): number {
    return this.getOrCreateDevice(deviceId).plumes_count;
  }

  /**
   * consume_plumes : décrémente atomiquement de `amount`.
   * - Si premium → retourne 999999 (pas de consommation).
   * - Si solde < amount → retourne -1 (échec).
   * - Sinon → retourne le solde restant.
   */
  consumePlumes(deviceId: string, amount: number): number {
    const row = this.getOrCreateDevice(deviceId);
    if (row.is_premium) return 999999;
    if (row.plumes_count < amount) return -1;
    row.plumes_count -= amount;
    row.updated_at = new Date();
    return row.plumes_count;
  }

  /**
   * credit_plumes : incrémente atomiquement.
   * UPSERT : si le device n'existe pas, crée avec DEFAULT + amount.
   */
  creditPlumes(deviceId: string, amount: number): number {
    const row = this.getOrCreateDevice(deviceId);
    row.plumes_count += amount;
    row.updated_at = new Date();
    return row.plumes_count;
  }

  /**
   * claim_daily_reward : +10 plumes, 1x par 24h.
   * Retourne le nouveau solde ou -1 si cooldown pas écoulé.
   */
  claimDailyReward(deviceId: string, now?: Date): number {
    const currentTime = now ?? new Date();
    const row = this.getOrCreateDevice(deviceId);

    if (row.last_daily_reward_at) {
      const cooldownEnd = new Date(row.last_daily_reward_at.getTime() + 24 * 60 * 60 * 1000);
      if (currentTime < cooldownEnd) {
        return -1; // cooldown pas écoulé
      }
    }

    row.plumes_count += PLUMES.DAILY_REWARD;
    row.last_daily_reward_at = currentTime;
    row.updated_at = currentTime;
    return row.plumes_count;
  }

  /** set_device_premium : active/désactive le premium device-level. */
  setDevicePremium(deviceId: string, isPremium: boolean): void {
    const row = this.getOrCreateDevice(deviceId);
    row.is_premium = isPremium;
    row.updated_at = new Date();
  }

  /**
   * redeem_promo_code : utilise un code promo.
   * Retourne 'ok', 'already_redeemed', 'invalid_code'.
   */
  redeemPromoCode(deviceId: string, code: string): "ok" | "already_redeemed" | "invalid_code" {
    const normalizedCode = code.toUpperCase();
    const promo = this.promoCodes.get(normalizedCode);
    if (!promo) return "invalid_code";

    // Vérifier si déjà utilisé par ce device
    const alreadyUsed = this.redemptions.some(
      (r) => r.device_id === deviceId && r.code === normalizedCode,
    );
    if (alreadyUsed) return "already_redeemed";

    // Enregistrer la rédemption
    this.redemptions.push({ device_id: deviceId, code: normalizedCode, redeemed_at: new Date() });

    // Créditer les plumes
    this.creditPlumes(deviceId, promo.bonus);

    // Premium si applicable
    if (promo.grant_premium) {
      this.setDevicePremium(deviceId, true);
    }

    return "ok";
  }

  // ── Helpers pour pré-check gate (simule llm-gateway) ──

  /**
   * Simule le pré-check gate du llm-gateway :
   * Si willFinalize && !premium && plumes < SESSION_COST → "no_plumes" (402)
   */
  preCheckGate(deviceId: string | undefined, willFinalize: boolean, profilePremium = false): "ok" | "no_plumes" {
    if (profilePremium) return "ok";
    // Pas de device_id → free pass (pub non disponible, on laisse passer)
    if (!deviceId) return "ok";

    const info = this.getDevicePlumesInfo(deviceId);
    if (info.is_premium) return "ok";

    if (willFinalize && info.plumes_count < PLUMES.SESSION_COST) {
      return "no_plumes";
    }

    return "ok";
  }

  /**
   * Simule la consommation fire-and-forget post-finalisation :
   * Débite SESSION_COST plumes si c'est le premier résultat (pas refine/reroll).
   */
  postFinalizeConsume(
    deviceId: string | undefined,
    statut: string,
    hadRefineOrReroll: boolean,
    profilePremium = false,
  ): { consumed: boolean; remaining: number } {
    if (profilePremium) return { consumed: false, remaining: 999999 };
    // Pas de device_id → free pass, pas de consommation
    if (!deviceId) return { consumed: false, remaining: -1 };

    const isFirstResult = statut === "finalisé" && !hadRefineOrReroll;
    if (!isFirstResult) return { consumed: false, remaining: this.getDevicePlumes(deviceId) };

    const remaining = this.consumePlumes(deviceId, PLUMES.SESSION_COST);
    return { consumed: remaining >= 0, remaining };
  }

  // ── Debug ──

  /** Retourne l'état complet pour debug */
  inspect(deviceId: string): DeviceRow | undefined {
    return this.devices.get(deviceId);
  }

  /** Reset complet (pour tests) */
  reset(): void {
    this.devices.clear();
    this.redemptions = [];
  }
}
