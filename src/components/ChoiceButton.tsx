import { Pressable, Text, StyleSheet } from "react-native";
import { useTheme } from "@/contexts/ThemeContext";
import type { ThemeColors } from "@/constants";

interface ChoiceButtonProps {
  label: string;
  onPress: () => void;
  variant?: "primary" | "secondary";
  disabled?: boolean;
}

export function ChoiceButton({
  label,
  onPress,
  variant = "primary",
  disabled = false,
}: ChoiceButtonProps) {
  const { colors } = useTheme();
  const s = getStyles(colors);
  const isPrimary = variant === "primary";

  return (
    <Pressable
      style={[
        s.base,
        isPrimary ? s.primary : s.secondary,
        disabled && s.disabled,
      ]}
      onPress={onPress}
      disabled={disabled}
    >
      <Text style={[s.text, isPrimary ? s.textPrimary : s.textSecondary]}>
        {label}
      </Text>
    </Pressable>
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
    text: {
      fontSize: 18,
      fontWeight: "600",
    },
    textPrimary: {
      color: colors.white,
    },
    textSecondary: {
      color: colors.textSecondary,
    },
  });
