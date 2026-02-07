import { useRef } from "react";
import { View, Text, ActivityIndicator, StyleSheet } from "react-native";
import { Image } from "expo-image";
import { useTranslation } from "react-i18next";
import { useTheme } from "@/contexts/ThemeContext";
import type { ThemeColors } from "@/constants";

const LOADING_ANIMATIONS = [
  require("../../assets/images/mogogo-writing.webp"),
  require("../../assets/images/mogogo-dancing.webp"),
  require("../../assets/images/mogogo-running.webp"),
  require("../../assets/images/mogogo-joy.webp"),
];

let loadingIndex = 0;

interface LoadingMogogoProps {
  message?: string;
}

export function LoadingMogogo({ message }: LoadingMogogoProps) {
  const { t } = useTranslation();
  const { colors } = useTheme();
  const s = getStyles(colors);
  const displayMessage = message ?? t("common.loading");
  const animationSource = useRef(LOADING_ANIMATIONS[loadingIndex % LOADING_ANIMATIONS.length]);
  loadingIndex++;

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
      width: 320,
      height: 320,
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
