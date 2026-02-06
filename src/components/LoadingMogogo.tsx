import { useRef } from "react";
import { View, Text, ActivityIndicator, StyleSheet } from "react-native";
import { Image } from "expo-image";
import { COLORS } from "@/constants";

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

export function LoadingMogogo({ message = "Mogogo réfléchit..." }: LoadingMogogoProps) {
  const animationSource = useRef(LOADING_ANIMATIONS[loadingIndex % LOADING_ANIMATIONS.length]);
  loadingIndex++;

  return (
    <View style={styles.container}>
      <Image
        source={animationSource.current}
        style={styles.mascot}
        contentFit="contain"
        autoplay={true}
      />
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
    color: COLORS.textSecondary,
    fontStyle: "italic",
  },
});
