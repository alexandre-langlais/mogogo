import mobileAds, {
  MaxAdContentRating,
  InterstitialAd,
  AdEventType,
  TestIds,
} from "react-native-google-mobile-ads";
import { Platform } from "react-native";

/** Test Ad Unit IDs — à remplacer par les vrais IDs en production */
export const AD_UNIT_IDS = {
  BANNER: Platform.select({
    android: "ca-app-pub-3940256099942544/9214589741",
    ios: "ca-app-pub-3940256099942544/2435281174",
    default: "",
  }),
  INTERSTITIAL: Platform.select({
    android: "ca-app-pub-3940256099942544/1033173712",
    ios: "ca-app-pub-3940256099942544/4411468910",
    default: "",
  }),
};

let interstitialAd: InterstitialAd | null = null;
let interstitialLoaded = false;

/**
 * Initialise le SDK Google Mobile Ads.
 * À appeler une seule fois au lancement de l'app.
 */
export async function initAdMob(): Promise<void> {
  await mobileAds().setRequestConfiguration({
    maxAdContentRating: MaxAdContentRating.G,
    tagForChildDirectedTreatment: false,
    tagForUnderAgeOfConsent: false,
  });

  await mobileAds().initialize();
}

/**
 * Précharge un interstitiel. À appeler en avance (ex: au montage du funnel).
 * Resolve quand l'ad est prête ou si le chargement échoue (fail silencieux).
 */
export async function loadInterstitial(): Promise<void> {
  interstitialLoaded = false;
  interstitialAd = InterstitialAd.createForAdRequest(
    AD_UNIT_IDS.INTERSTITIAL || TestIds.INTERSTITIAL,
  );

  return new Promise<void>((resolve) => {
    const ad = interstitialAd!;

    const unsubLoaded = ad.addAdEventListener(AdEventType.LOADED, () => {
      interstitialLoaded = true;
      unsubLoaded();
      unsubError();
      resolve();
    });

    const unsubError = ad.addAdEventListener(AdEventType.ERROR, () => {
      interstitialLoaded = false;
      unsubLoaded();
      unsubError();
      resolve(); // fail silencieux — on ne bloque pas le flux
    });

    ad.load();
  });
}

/**
 * Affiche l'interstitiel préchargé.
 * Resolve quand l'utilisateur ferme l'ad, ou immédiatement si pas chargé.
 */
export async function showInterstitial(): Promise<void> {
  if (!interstitialAd || !interstitialLoaded) return;

  return new Promise<void>((resolve) => {
    const ad = interstitialAd!;

    const unsubClosed = ad.addAdEventListener(AdEventType.CLOSED, () => {
      unsubClosed();
      interstitialAd = null;
      interstitialLoaded = false;
      resolve();
    });

    ad.show().catch(() => {
      unsubClosed();
      interstitialAd = null;
      interstitialLoaded = false;
      resolve();
    });
  });
}
