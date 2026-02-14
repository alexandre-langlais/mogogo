import mobileAds, {
  MaxAdContentRating,
  RewardedAd,
  RewardedAdEventType,
  AdEventType,
  TestIds,
} from "react-native-google-mobile-ads";
import { Platform } from "react-native";

/** Test Ad Unit IDs — à remplacer par les vrais IDs en production */
export const AD_UNIT_IDS = {
  REWARDED: Platform.select({
    android: "ca-app-pub-3940256099942544/5224354917",
    ios: "ca-app-pub-3940256099942544/1712485313",
    default: "",
  }),
};

let rewardedAd: RewardedAd | null = null;
let rewardedLoaded = false;

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
 * Précharge une rewarded video. À appeler en avance (ex: au montage du funnel).
 * Resolve quand l'ad est prête ou si le chargement échoue (fail silencieux).
 */
export async function loadRewarded(): Promise<void> {
  rewardedLoaded = false;
  rewardedAd = RewardedAd.createForAdRequest(
    AD_UNIT_IDS.REWARDED || TestIds.REWARDED,
  );

  return new Promise<void>((resolve) => {
    const ad = rewardedAd!;

    const unsubLoaded = ad.addAdEventListener(RewardedAdEventType.LOADED, () => {
      rewardedLoaded = true;
      unsubLoaded();
      unsubError();
      resolve();
    });

    const unsubError = ad.addAdEventListener(AdEventType.ERROR, () => {
      rewardedLoaded = false;
      unsubLoaded();
      unsubError();
      resolve(); // fail silencieux — on ne bloque pas le flux
    });

    ad.load();
  });
}

/** Vérifie si une rewarded video est prête à être affichée. */
export function isRewardedLoaded(): boolean {
  return rewardedLoaded;
}

/**
 * Affiche la rewarded video préchargée.
 * Retourne true si l'utilisateur a regardé la vidéo en entier (reward earned),
 * false s'il a fermé avant la fin ou si l'ad n'était pas chargée.
 */
export async function showRewarded(): Promise<boolean> {
  if (!rewardedAd || !rewardedLoaded) return false;

  return new Promise<boolean>((resolve) => {
    const ad = rewardedAd!;
    let earned = false;

    const unsubEarned = ad.addAdEventListener(
      RewardedAdEventType.EARNED_REWARD,
      () => {
        earned = true;
      },
    );

    const unsubClosed = ad.addAdEventListener(AdEventType.CLOSED, () => {
      unsubEarned();
      unsubClosed();
      rewardedAd = null;
      rewardedLoaded = false;
      resolve(earned);
    });

    ad.show().catch(() => {
      unsubEarned();
      unsubClosed();
      rewardedAd = null;
      rewardedLoaded = false;
      resolve(false);
    });
  });
}
