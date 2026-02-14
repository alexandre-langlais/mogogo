/** Web stub — AdMob n'est pas disponible sur le web */

export const AD_UNIT_IDS = {
  REWARDED: "",
};

export async function initAdMob(): Promise<void> {
  // no-op on web
}

export async function loadRewarded(): Promise<void> {
  // no-op on web
}

export function isRewardedLoaded(): boolean {
  return true; // web — pas de pub, on laisse toujours passer
}

export async function showRewarded(): Promise<boolean> {
  return true; // pas de pub sur web — on laisse passer
}
