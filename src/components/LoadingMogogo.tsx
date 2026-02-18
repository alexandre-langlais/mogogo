import { useRef, useState, useEffect } from "react";
import { View, Text, ActivityIndicator, StyleSheet, Animated } from "react-native";
import { Image } from "expo-image";
import { useTranslation } from "react-i18next";
import { useTheme } from "@/contexts/ThemeContext";
import type { ThemeColors } from "@/constants";
import type { FunnelChoice } from "@/types";

export type AnimationCategory = "questionnement" | "pivot" | "resultat" | "validation";

const QUESTIONING_FRAMES = [
  require("../../assets/animations/questionnement/mogogo-questioning-1.webp"),
  require("../../assets/animations/questionnement/mogogo-questioning-2.webp"),
  require("../../assets/animations/questionnement/mogogo-questioning-3.webp"),
];

const ANIMATIONS: Record<AnimationCategory, any[]> = {
  questionnement: QUESTIONING_FRAMES,
  pivot: QUESTIONING_FRAMES,
  resultat: QUESTIONING_FRAMES,
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
    case "finalize":
    case "reroll":
      return "resultat";
    default:
      return "questionnement";
  }
}

// Messages progressifs : changent en fonction du temps écoulé
const LOADING_STEP_KEYS = [
  { key: "funnel.loadingStep1", delay: 0 },
  { key: "funnel.loadingStep2", delay: 1500 },
  { key: "funnel.loadingStep3", delay: 3500 },
  { key: "funnel.loadingStep4", delay: 6000 },
];

function useProgressiveMessage(fixedMessage?: string): string {
  const { t } = useTranslation();
  const [stepIndex, setStepIndex] = useState(0);

  useEffect(() => {
    if (fixedMessage) return;

    const timers = LOADING_STEP_KEYS.slice(1).map((step, i) =>
      setTimeout(() => setStepIndex(i + 1), step.delay)
    );

    return () => {
      timers.forEach(clearTimeout);
      setStepIndex(0);
    };
  }, [fixedMessage]);

  if (fixedMessage) return fixedMessage;
  return t(LOADING_STEP_KEYS[stepIndex].key);
}

interface LoadingMogogoProps {
  message?: string;
  category?: AnimationCategory;
}

export function LoadingMogogo({ message, category = "questionnement" }: LoadingMogogoProps) {
  const { colors } = useTheme();
  const s = getStyles(colors);
  const displayMessage = useProgressiveMessage(message);
  const animationSource = useRef(getNextAnimation(category));
  const fadeAnim = useRef(new Animated.Value(1)).current;
  const prevMessage = useRef(displayMessage);

  // Fade transition quand le message change
  useEffect(() => {
    if (prevMessage.current !== displayMessage) {
      prevMessage.current = displayMessage;
      fadeAnim.setValue(0);
      Animated.timing(fadeAnim, {
        toValue: 1,
        duration: 300,
        useNativeDriver: true,
      }).start();
    }
  }, [displayMessage]);

  return (
    <View style={s.container}>
      <Image
        source={animationSource.current}
        style={s.mascot}
        contentFit="contain"
        autoplay={true}
      />
      <ActivityIndicator size="large" color={colors.primary} style={s.spinner} />
      <Animated.Text style={[s.message, { opacity: fadeAnim }]}>{displayMessage}</Animated.Text>
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
      backgroundColor: "transparent",
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
