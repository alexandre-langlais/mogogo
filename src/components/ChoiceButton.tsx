import { Pressable, Text, StyleSheet } from "react-native";
import { COLORS } from "@/constants";

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
  const isPrimary = variant === "primary";

  return (
    <Pressable
      style={[
        styles.base,
        isPrimary ? styles.primary : styles.secondary,
        disabled && styles.disabled,
      ]}
      onPress={onPress}
      disabled={disabled}
    >
      <Text style={[styles.text, isPrimary ? styles.textPrimary : styles.textSecondary]}>
        {label}
      </Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  base: {
    padding: 18,
    borderRadius: 12,
    alignItems: "center",
    width: "100%",
  },
  primary: {
    backgroundColor: COLORS.primary,
  },
  secondary: {
    borderWidth: 1,
    borderColor: COLORS.border,
    backgroundColor: COLORS.background,
  },
  disabled: {
    opacity: 0.5,
  },
  text: {
    fontSize: 18,
    fontWeight: "600",
  },
  textPrimary: {
    color: COLORS.white,
  },
  textSecondary: {
    color: COLORS.textSecondary,
  },
});
