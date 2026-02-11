import mobileAds, { MaxAdContentRating } from "react-native-google-mobile-ads";
import { Platform } from "react-native";

/** Test Ad Unit IDs — à remplacer par les vrais IDs en production */
export const AD_UNIT_IDS = {
  BANNER: Platform.select({
    android: "ca-app-pub-3940256099942544/9214589741",
    ios: "ca-app-pub-3940256099942544/2435281174",
    default: "",
  }),
};

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
