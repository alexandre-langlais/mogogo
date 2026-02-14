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

  if (dailyRewardCountdown) {
    return (
      <View style={[s.banner, s.bannerCountdown]}>
        <Text style={s.countdownText}>
          {t("plumes.dailyCountdown", { time: dailyRewardCountdown })}
        </Text>
      </View>
    );
  }

  return null;
}

const getStyles = (colors: ThemeColors) =>
  StyleSheet.create({
    banner: {
      borderRadius: 12,
      padding: 12,
      marginBottom: 12,
      alignItems: "center",
    },
    bannerAvailable: {
      backgroundColor: "#FFF3CD",
      borderWidth: 1,
      borderColor: "#FFCA28",
    },
    bannerClaimed: {
      backgroundColor: "#E8F5E9",
      borderWidth: 1,
      borderColor: "#66BB6A",
    },
    bannerCountdown: {
      backgroundColor: colors.surface,
      borderWidth: 1,
      borderColor: colors.border,
    },
    availableText: {
      fontSize: 15,
      fontWeight: "600",
      color: "#6D4C00",
      marginBottom: 8,
    },
    claimButton: {
      backgroundColor: "#FFCA28",
      borderRadius: 8,
      paddingVertical: 8,
      paddingHorizontal: 16,
    },
    claimButtonText: {
      fontSize: 14,
      fontWeight: "700",
      color: "#4E3500",
    },
    claimedText: {
      fontSize: 14,
      fontWeight: "600",
      color: "#2E7D32",
    },
    countdownText: {
      fontSize: 13,
      color: colors.textSecondary,
    },
  });
