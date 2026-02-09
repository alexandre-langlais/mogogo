import { useRef, useCallback } from "react";
import { Pressable, Text, StyleSheet, Animated, Platform } from "react-native";
import * as Haptics from "expo-haptics";
import { useTheme } from "@/contexts/ThemeContext";
import type { ThemeColors } from "@/constants";

interface ChoiceButtonProps {
  label: string;
  onPress: () => void;
  variant?: "primary" | "secondary";
  disabled?: boolean;
  /** Quand true, le bouton se fond (opacité réduite, pas d'interaction) */
  faded?: boolean;
  /** Quand true, le bouton reste visible et mis en évidence comme "choisi" */
  chosen?: boolean;
  /** Icône (emoji/texte) affichée avant le label */
  icon?: string;
}

export function ChoiceButton({
  label,
  onPress,
  variant = "primary",
  disabled = false,
  faded = false,
  chosen = false,
  icon,
}: ChoiceButtonProps) {
  const { colors } = useTheme();
  const s = getStyles(colors);
  const isPrimary = variant === "primary";
  const scaleAnim = useRef(new Animated.Value(1)).current;

  const handlePress = useCallback(() => {
    // Feedback haptique (natif uniquement)
    if (Platform.OS !== "web") {
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    }

    // Animation de contraction/pulse
    Animated.sequence([
      Animated.timing(scaleAnim, {
        toValue: 0.95,
        duration: 80,
        useNativeDriver: true,
      }),
      Animated.timing(scaleAnim, {
        toValue: 1,
        duration: 80,
        useNativeDriver: true,
      }),
    ]).start();

    onPress();
  }, [onPress, scaleAnim]);

  return (
    <Animated.View style={{ transform: [{ scale: scaleAnim }], opacity: faded ? 0.3 : 1 }}>
      <Pressable
        style={[
          s.base,
          isPrimary ? s.primary : s.secondary,
          disabled && s.disabled,
          chosen && s.chosen,
        ]}
        onPress={handlePress}
        disabled={disabled || faded}
      >
        <Text style={[s.text, isPrimary ? s.textPrimary : s.textSecondary]}>
          {icon ? `${icon}  ${label}` : label}
        </Text>
      </Pressable>
    </Animated.View>
  );
}

const getStyles = (colors: ThemeColors) =>
  StyleSheet.create({
    base: {
      padding: 18,
      borderRadius: 12,
      alignItems: "center",
      width: "100%",
    },
    primary: {
      backgroundColor: colors.primary,
    },
    secondary: {
      borderWidth: 1,
      borderColor: colors.border,
      backgroundColor: colors.background,
    },
    disabled: {
      opacity: 0.5,
    },
    chosen: {
      borderWidth: 2,
      borderColor: colors.primary,
    },
    text: {
      fontSize: 18,
      fontWeight: "600",
    },
    textPrimary: {
      color: colors.white,
    },
    textSecondary: {
      color: colors.textSecondary,
      fontSize: 15,
    },
  });
