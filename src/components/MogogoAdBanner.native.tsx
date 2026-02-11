import { useState } from "react";
import { View, StyleSheet } from "react-native";
import { BannerAd, BannerAdSize } from "react-native-google-mobile-ads";
import { AD_UNIT_IDS } from "@/services/admob";
import { useProfile } from "@/hooks/useProfile";

/**
 * Bannière publicitaire adaptive Mogogo.
 * Masquée automatiquement pour les utilisateurs premium.
 */
export function MogogoAdBanner() {
  const { profile } = useProfile();
  const [adLoaded, setAdLoaded] = useState(false);

  if (profile?.plan === "premium" || !AD_UNIT_IDS.BANNER) {
    return null;
  }

  return (
    <View style={[styles.container, !adLoaded && styles.hidden]}>
      <BannerAd
        unitId={AD_UNIT_IDS.BANNER}
        size={BannerAdSize.ANCHORED_ADAPTIVE_BANNER}
        requestOptions={{ requestNonPersonalizedAdsOnly: true }}
        onAdLoaded={() => setAdLoaded(true)}
        onAdFailedToLoad={(error) => {
          console.warn("[AdMob] Banner failed to load:", error.message);
          setAdLoaded(false);
        }}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    alignItems: "center",
    width: "100%",
  },
  hidden: {
    height: 0,
    overflow: "hidden",
  },
});
