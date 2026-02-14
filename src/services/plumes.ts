import { supabase } from "./supabase";
import { getDeviceId } from "./deviceId";

/** Constantes d'économie des plumes */
export const PLUMES = {
  DEFAULT: 30,
  SESSION_COST: 10,
  AD_REWARD: 30,
  AD_REWARD_GATE: 40,
  DAILY_REWARD: 10,
  PACK_SMALL: 100,
  PACK_LARGE: 300,
} as const;

export interface DevicePlumesInfo {
  plumes: number;
  lastDailyRewardAt: string | null;
  isPremium: boolean;
}

/** Récupérer les infos complètes de plumes pour le device courant */
export async function getPlumesInfo(): Promise<DevicePlumesInfo | null> {
  const deviceId = await getDeviceId();
  if (!deviceId) return null; // web: pas de plumes

  const { data, error } = await supabase.rpc("get_device_plumes_info", {
    p_device_id: deviceId,
  });

  if (error || !data || !Array.isArray(data) || data.length === 0) {
    return { plumes: PLUMES.DEFAULT, lastDailyRewardAt: null, isPremium: false };
  }

  const row = data[0];
  return {
    plumes: row.plumes_count ?? PLUMES.DEFAULT,
    lastDailyRewardAt: row.last_daily_reward_at ?? null,
    isPremium: row.is_premium === true,
  };
}

/** Récupérer le nombre de plumes pour le device courant */
export async function getPlumesCount(): Promise<number> {
  const deviceId = await getDeviceId();
  if (!deviceId) return -1; // web: pas de plumes

  const { data, error } = await supabase.rpc("get_device_plumes", {
    p_device_id: deviceId,
  });

  if (error) return PLUMES.DEFAULT; // fallback
  return data ?? PLUMES.DEFAULT;
}

/** Créditer des plumes (après pub ou promo) */
export async function creditPlumes(amount: number): Promise<number> {
  const deviceId = await getDeviceId();
  if (!deviceId) return -1;

  const { data, error } = await supabase.rpc("credit_plumes", {
    p_device_id: deviceId,
    p_amount: amount,
  });

  if (error) return -1;
  return data ?? 0;
}

/** Réclamer le bonus quotidien (+10 plumes). Retourne le nouveau solde ou null si trop tôt. */
export async function claimDailyReward(): Promise<number | null> {
  const deviceId = await getDeviceId();
  if (!deviceId) return null;

  const { data, error } = await supabase.rpc("claim_daily_reward", {
    p_device_id: deviceId,
  });

  if (error) return null;
  if (data === -1) return null; // cooldown pas écoulé
  return data;
}

/** Définir le statut premium device-level */
export async function setDevicePremium(isPremium: boolean): Promise<void> {
  const deviceId = await getDeviceId();
  if (!deviceId) return;

  await supabase.rpc("set_device_premium", {
    p_device_id: deviceId,
    p_is_premium: isPremium,
  });
}
