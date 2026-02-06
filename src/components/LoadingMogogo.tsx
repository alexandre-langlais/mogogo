import { View, Text, ActivityIndicator, StyleSheet } from "react-native";
import { COLORS } from "@/constants";

interface LoadingMogogoProps {
  message?: string;
}

export function LoadingMogogo({ message = "Mogogo réfléchit..." }: LoadingMogogoProps) {
  return (
    <View style={styles.container}>
      <Text style={styles.emoji}>🦉</Text>
      <ActivityIndicator size="large" color={COLORS.primary} style={styles.spinner} />
      <Text style={styles.message}>{message}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
    padding: 24,
    backgroundColor: COLORS.background,
  },
  emoji: {
    fontSize: 48,
    marginBottom: 16,
  },
  spinner: {
    marginBottom: 16,
  },
  message: {
    fontSize: 16,
    color: COLORS.textSecondary,
    fontStyle: "italic",
  },
});
