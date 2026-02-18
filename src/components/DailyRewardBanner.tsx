import { useState } from "react";
import { View, Text, Pressable, StyleSheet, Animated } from "react-native";
import { useTranslation } from "react-i18next";
import { usePlumes } from "@/contexts/PlumesContext";
import { useTheme } from "@/contexts/ThemeContext";
import type { ThemeColors } from "@/constants";

export function DailyRewardBanner() {
  const { t } = useTranslation();
  const { colors } = useTheme();
  const s = getStyles(colors);
  const { dailyRewardAvailable, dailyRewardCountdown, claimDaily, isPremium } = usePlumes();
  const [claimed, setClaimed] = useState(false);
  const [pulseAnim] = useState(() => new Animated.Value(1));

  if (isPremium) return null;

  const handleClaim = async () => {
    const ok = await claimDaily();
    if (ok) {
      setClaimed(true);
      Animated.sequence([
        Animated.timing(pulseAnim, { toValue: 1.05, duration: 150, useNativeDriver: true }),
        Animated.timing(pulseAnim, { toValue: 1, duration: 150, useNativeDriver: true }),
      ]).start();
    }
  };

  if (claimed) {
    return (
      <Animated.View style={[s.banner, s.bannerClaimed, { transform: [{ scale: pulseAnim }] }]}>
        <Text style={s.claimedText}>{t("plumes.dailyClaimed")}</Text>
      </Animated.View>
    );
  }

  if (dailyRewardAvailable) {
    return (
      <Pressable style={[s.banner, s.bannerAvailable]} onPress={handleClaim}>
        <Text style={s.availableText}>{t("plumes.dailyAvailable")}</Text>
        <View style={s.claimButton}>
          <Text style={s.claimButtonText}>{t("plumes.dailyClaim")}</Text>
        </View>
      </Pressable>
    );
  }

  return null;
}

const getStyles = (colors: ThemeColors) =>
  StyleSheet.create({
    banner: {
      borderRadius: 12,
      padding: 12,
      marginHorizontal: 24,
      marginBottom: 8,
      alignItems: "center",
    },
    bannerAvailable: {
      backgroundColor: colors.primary + "15",
      borderWidth: 1,
      borderColor: colors.primary + "40",
    },
    bannerClaimed: {
      backgroundColor: "#2ECC7115",
      borderWidth: 1,
      borderColor: "#2ECC7140",
    },
    availableText: {
      fontSize: 15,
      fontWeight: "600",
      color: colors.text,
      marginBottom: 8,
    },
    claimButton: {
      backgroundColor: colors.primary,
      borderRadius: 8,
      paddingVertical: 8,
      paddingHorizontal: 16,
    },
    claimButtonText: {
      fontSize: 14,
      fontWeight: "700",
      color: colors.white,
    },
    claimedText: {
      fontSize: 14,
      fontWeight: "600",
      color: "#2ECC71",
    },
  });
