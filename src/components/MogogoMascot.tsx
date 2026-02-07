import { View, Text, StyleSheet } from "react-native";
import { Image } from "expo-image";
import { useTheme } from "@/contexts/ThemeContext";
import type { ThemeColors } from "@/constants";

interface MogogoMascotProps {
  message: string;
}

export function MogogoMascot({ message }: MogogoMascotProps) {
  const { colors } = useTheme();
  const s = getStyles(colors);

  return (
    <View style={s.container}>
      <Image
        source={require("../../assets/images/mogogo-waiting.png")}
        style={s.mascot}
        contentFit="contain"
      />
      <View style={s.bubble}>
        <Text style={s.message}>{message}</Text>
      </View>
    </View>
  );
}

const getStyles = (colors: ThemeColors) =>
  StyleSheet.create({
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
      backgroundColor: colors.surface,
      borderRadius: 16,
      padding: 16,
      maxWidth: "90%",
    },
    message: {
      fontSize: 16,
      color: colors.primary,
      textAlign: "center",
      fontStyle: "italic",
      lineHeight: 22,
    },
  });
