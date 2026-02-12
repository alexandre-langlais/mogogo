/** Web stub — RevenueCat n'est pas disponible sur le web */

export async function initPurchases(): Promise<void> {
  // no-op on web
}

export async function identifyUser(_userId: string): Promise<void> {
  // no-op on web
}

export async function logoutPurchases(): Promise<void> {
  // no-op on web
}

export async function checkEntitlement(): Promise<boolean> {
  return false;
}

export async function presentPaywall(): Promise<boolean> {
  return false;
}

export async function presentCustomerCenter(): Promise<void> {
  // no-op on web
}

export async function restorePurchases(): Promise<boolean> {
  return false;
}

export async function syncPlanToSupabase(_isPremium: boolean): Promise<void> {
  // no-op on web
}

export function onCustomerInfoChanged(
  _callback: (isPremium: boolean) => void,
): () => void {
  return () => {};
}
