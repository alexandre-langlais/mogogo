import { useRef } from "react";
import { View, Text, ActivityIndicator, StyleSheet } from "react-native";
import { Image } from "expo-image";
import { useTranslation } from "react-i18next";
import { useTheme } from "@/contexts/ThemeContext";
import type { ThemeColors } from "@/constants";
import type { FunnelChoice } from "@/types";

export type AnimationCategory = "questionnement" | "pivot" | "resultat" | "validation";

const ANIMATIONS: Record<AnimationCategory, any[]> = {
  questionnement: [
    require("../../assets/animations/questionnement/mogogo-questioning-1.webp"),
    require("../../assets/animations/questionnement/mogogo-questioning-2.webp"),
    require("../../assets/animations/questionnement/mogogo-questioning-3.webp"),
  ],
  pivot: [
    require("../../assets/animations/pivot/mogogo-pivot-1.webp"),
    require("../../assets/animations/pivot/mogogo-pivot-2.webp"),
  ],
  resultat: [
    require("../../assets/animations/resultat/mogogo-resultat-1.webp"),
    require("../../assets/animations/resultat/mogogo-resultat-2.webp"),
  ],
  validation: [
    require("../../assets/animations/validation/mogogo-joy-1.webp"),
  ],
};

const categoryCounters: Record<AnimationCategory, number> = {
  questionnement: 0,
  pivot: 0,
  resultat: 0,
  validation: 0,
};

export function getNextAnimation(category: AnimationCategory) {
  const pool = ANIMATIONS[category];
  const index = categoryCounters[category] % pool.length;
  categoryCounters[category]++;
  return pool[index];
}

export function choiceToAnimationCategory(choice?: FunnelChoice): AnimationCategory {
  switch (choice) {
    case "neither":
      return "pivot";
    case "reroll":
      return "resultat";
    default:
      return "questionnement";
  }
}

interface LoadingMogogoProps {
  message?: string;
  category?: AnimationCategory;
}

export function LoadingMogogo({ message, category = "questionnement" }: LoadingMogogoProps) {
  const { t } = useTranslation();
  const { colors } = useTheme();
  const s = getStyles(colors);
  const displayMessage = message ?? t("common.loading");
  const animationSource = useRef(getNextAnimation(category));

  return (
    <View style={s.container}>
      <Image
        source={animationSource.current}
        style={s.mascot}
        contentFit="contain"
        autoplay={true}
      />
      <ActivityIndicator size="large" color={colors.primary} style={s.spinner} />
      <Text style={s.message}>{displayMessage}</Text>
    </View>
  );
}

const getStyles = (colors: ThemeColors) =>
  StyleSheet.create({
    container: {
      flex: 1,
      justifyContent: "center",
      alignItems: "center",
      padding: 24,
      backgroundColor: colors.background,
    },
    mascot: {
      width: 160,
      height: 160,
      marginBottom: 16,
    },
    spinner: {
      marginBottom: 16,
    },
    message: {
      fontSize: 16,
      color: colors.textSecondary,
      fontStyle: "italic",
    },
  });
