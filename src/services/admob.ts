/** Web stub — AdMob n'est pas disponible sur le web */

export const AD_UNIT_IDS = {
  BANNER: "",
  INTERSTITIAL: "",
};

export async function initAdMob(): Promise<void> {
  // no-op on web
}

export async function loadInterstitial(): Promise<void> {
  // no-op on web
}

export async function showInterstitial(): Promise<void> {
  // no-op on web
}
