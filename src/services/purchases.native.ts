import Purchases, {
  type CustomerInfo,
  LOG_LEVEL,
} from "react-native-purchases";
import RevenueCatUI from "react-native-purchases-ui";
import { Platform } from "react-native";
import { supabase } from "@/services/supabase";

const ENTITLEMENT_ID = "premium";

function getApiKey(): string {
  const key = Platform.OS === "ios"
    ? process.env.EXPO_PUBLIC_REVENUECAT_APPLE_KEY
    : process.env.EXPO_PUBLIC_REVENUECAT_GOOGLE_KEY;

  if (!key) {
    console.warn("[Purchases] Missing EXPO_PUBLIC_REVENUECAT_*_KEY env var");
    return "";
  }
  return key;
}

function hasPremium(info: CustomerInfo): boolean {
  return ENTITLEMENT_ID in (info.entitlements.active ?? {});
}

/**
 * Initialise le SDK RevenueCat.
 * À appeler une seule fois au lancement de l'app.
 */
export async function initPurchases(): Promise<void> {
  if (__DEV__) {
    Purchases.setLogLevel(LOG_LEVEL.DEBUG);
  }

  Purchases.configure({ apiKey: getApiKey() });
}

/** Associe un user Supabase à RevenueCat */
export async function identifyUser(userId: string): Promise<void> {
  await Purchases.logIn(userId);
}

/** Déconnecte l'utilisateur RevenueCat */
export async function logoutPurchases(): Promise<void> {
  await Purchases.logOut();
}

/** Vérifie si l'utilisateur a l'entitlement premium */
export async function checkEntitlement(): Promise<boolean> {
  const info = await Purchases.getCustomerInfo();
  return hasPremium(info);
}

/** Affiche le paywall RevenueCat natif. Retourne true si achat/restore réussi. */
export async function presentPaywall(): Promise<boolean> {
  const result = await RevenueCatUI.presentPaywall();
  // PURCHASED, RESTORED → true, sinon false
  return result === "PURCHASED" || result === "RESTORED";
}

/** Affiche le Customer Center (gestion d'abonnement) */
export async function presentCustomerCenter(): Promise<void> {
  await RevenueCatUI.presentCustomerCenter();
}

/** Restaure les achats. Retourne true si premium retrouvé. */
export async function restorePurchases(): Promise<boolean> {
  const info = await Purchases.restorePurchases();
  return hasPremium(info);
}

/** Met à jour `profiles.plan` dans Supabase */
export async function syncPlanToSupabase(isPremium: boolean): Promise<void> {
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return;

  await supabase
    .from("profiles")
    .update({ plan: isPremium ? "premium" : "free" })
    .eq("id", user.id);
}

/** Écoute les changements de CustomerInfo (achat, expiration, etc.) */
export function onCustomerInfoChanged(
  callback: (isPremium: boolean) => void,
): () => void {
  const listener = (info: CustomerInfo) => {
    callback(hasPremium(info));
  };

  Purchases.addCustomerInfoUpdateListener(listener);

  return () => {
    Purchases.removeCustomerInfoUpdateListener(listener);
  };
}
