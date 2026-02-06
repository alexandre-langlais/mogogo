import { View, Text, Pressable, StyleSheet } from "react-native";
import { useRouter } from "expo-router";
import { COLORS } from "@/constants";

export default function HomeScreen() {
  const router = useRouter();

  return (
    <View style={styles.container}>
      <Text style={styles.emoji}>🦉</Text>
      <Text style={styles.title}>Mogogo</Text>
      <Text style={styles.subtitle}>Ton hibou magicien</Text>
      <Pressable style={styles.button} onPress={() => router.push("/(auth)/login")}>
        <Text style={styles.buttonText}>Commencer</Text>
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
    backgroundColor: COLORS.background,
  },
  emoji: {
    fontSize: 72,
    marginBottom: 16,
  },
  title: {
    fontSize: 48,
    fontWeight: "bold",
    color: COLORS.text,
    marginBottom: 8,
  },
  subtitle: {
    fontSize: 18,
    color: COLORS.textSecondary,
    marginBottom: 32,
  },
  button: {
    backgroundColor: COLORS.primary,
    paddingHorizontal: 32,
    paddingVertical: 16,
    borderRadius: 12,
  },
  buttonText: {
    color: COLORS.white,
    fontSize: 18,
    fontWeight: "600",
  },
});
