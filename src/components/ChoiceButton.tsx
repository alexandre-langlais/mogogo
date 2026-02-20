import { useRef, useCallback, useState } from "react";
import { View, Pressable, Text, StyleSheet, Animated, Platform } from "react-native";
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
  /** Sous-titre optionnel affiché sous le label (mode card) */
  subtitle?: string;
}

export function ChoiceButton({
  label,
  onPress,
  variant = "primary",
  disabled = false,
  faded = false,
  chosen = false,
  icon,
  subtitle,
}: ChoiceButtonProps) {
  const { colors } = useTheme();
  const s = getStyles(colors);
  const isPrimary = variant === "primary";
  const isCard = !!icon && isPrimary;
  const scaleAnim = useRef(new Animated.Value(1)).current;
  const [pressed, setPressed] = useState(false);

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

  // Layout card : icône circulaire à gauche + texte à droite
  if (isCard) {
    return (
      <Animated.View style={{ transform: [{ scale: scaleAnim }], opacity: faded ? 0.3 : 1 }}>
        <Pressable
          style={[s.card, disabled && s.disabled, chosen && s.chosen, pressed && s.cardPressed]}
          onPress={handlePress}
          onPressIn={() => setPressed(true)}
          onPressOut={() => setPressed(false)}
          disabled={disabled || faded}
        >
          <View style={[s.cardIconCircle, pressed && s.cardIconCirclePressed]}>
            <Text style={s.cardIconText}>{icon}</Text>
          </View>
          <View style={s.cardContent}>
            <Text style={[s.cardLabel, pressed && s.cardLabelPressed]}>{label}</Text>
            {subtitle && <Text style={[s.cardSubtitle, pressed && s.cardSubtitlePressed]}>{subtitle}</Text>}
          </View>
        </Pressable>
      </Animated.View>
    );
  }

  // Layout classique (centered text)
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
    /* ─── Classic layout ─── */
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
      backgroundColor: "transparent",
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
      textAlign: "center",
    },
    textPrimary: {
      color: colors.white,
    },
    textSecondary: {
      color: colors.textSecondary,
      fontSize: 15,
    },

    /* ─── Card layout (icon + title + subtitle) ─── */
    card: {
      flexDirection: "row",
      alignItems: "center",
      width: "100%",
      padding: 16,
      borderRadius: 16,
      borderWidth: 1,
      borderColor: colors.border,
      backgroundColor: colors.surface,
      gap: 14,
    },
    cardPressed: {
      backgroundColor: colors.primary,
      borderColor: colors.primary,
    },
    cardIconCircle: {
      width: 44,
      height: 44,
      borderRadius: 22,
      backgroundColor: colors.primary + "20",
      justifyContent: "center",
      alignItems: "center",
    },
    cardIconCirclePressed: {
      backgroundColor: "rgba(255,255,255,0.25)",
    },
    cardIconText: {
      fontSize: 22,
    },
    cardContent: {
      flex: 1,
    },
    cardLabel: {
      fontSize: 16,
      fontWeight: "600",
      color: colors.text,
    },
    cardLabelPressed: {
      color: colors.white,
    },
    cardSubtitle: {
      fontSize: 13,
      color: colors.textSecondary,
      marginTop: 2,
      lineHeight: 18,
    },
    cardSubtitlePressed: {
      color: "rgba(255,255,255,0.8)",
    },
  });
