import { View, Pressable, Text, StyleSheet } from "react-native";
import { useRouter } from "expo-router";
import { PlumeCounter } from "./PlumeCounter";
import { useTheme } from "@/contexts/ThemeContext";

export function HeaderRight() {
  const router = useRouter();
  const { colors } = useTheme();

  return (
    <View style={styles.container}>
      <PlumeCounter />
      <Pressable onPress={() => router.push("/(main)/settings")} style={styles.settingsButton}>
        <Text style={[styles.settingsIcon, { color: colors.text }]}>{"\u2699\uFE0F"}</Text>
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flexDirection: "row",
    alignItems: "center",
  },
  settingsButton: {
    paddingHorizontal: 8,
    paddingVertical: 6,
  },
  settingsIcon: {
    fontSize: 20,
  },
});
