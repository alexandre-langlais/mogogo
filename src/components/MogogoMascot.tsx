import { View, Text, StyleSheet } from "react-native";
import { Image } from "expo-image";
import { COLORS } from "@/constants";

interface MogogoMascotProps {
  message: string;
}

export function MogogoMascot({ message }: MogogoMascotProps) {
  return (
    <View style={styles.container}>
      <Image
        source={require("../../assets/images/mogogo-waiting.png")}
        style={styles.mascot}
        contentFit="contain"
      />
      <View style={styles.bubble}>
        <Text style={styles.message}>{message}</Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    alignItems: "center",
    marginBottom: 24,
  },
  mascot: {
    width: 80,
    height: 80,
    marginBottom: 12,
  },
  bubble: {
    backgroundColor: COLORS.surface,
    borderRadius: 16,
    padding: 16,
    maxWidth: "90%",
  },
  message: {
    fontSize: 16,
    color: COLORS.primary,
    textAlign: "center",
    fontStyle: "italic",
    lineHeight: 22,
  },
});
