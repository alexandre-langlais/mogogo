import { View, Text, StyleSheet } from "react-native";
import { Image } from "expo-image";
import { useTheme } from "@/contexts/ThemeContext";
import type { ThemeColors } from "@/constants";

interface MogogoMascotProps {
  message: string;
  animationSource?: any;
  fullWidth?: boolean;
}

export function MogogoMascot({ message, animationSource, fullWidth }: MogogoMascotProps) {
  const { colors } = useTheme();
  const s = getStyles(colors);

  return (
    <View style={s.container}>
      <Image
        source={animationSource ?? require("../../assets/images/mogogo-waiting.png")}
        style={s.mascot}
        contentFit="contain"
        autoplay={!!animationSource}
      />
      <View style={[s.bubble, fullWidth && { maxWidth: "100%", width: "100%" }]}>
        <Text style={s.message}>{message.replace(/[\n\r]+/g, " ").replace(/\s{2,}/g, " ").trim()}</Text>
      </View>
    </View>
  );
}

const getStyles = (colors: ThemeColors) =>
  StyleSheet.create({
    container: {
      alignItems: "center",
      width: "100%",
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
      borderWidth: 1,
      borderColor: colors.border,
      padding: 16,
      maxWidth: "90%",
    },
    message: {
      fontSize: 16,
      color: colors.text,
      textAlign: "center",
      fontStyle: "italic",
      lineHeight: 22,
    },
  });
