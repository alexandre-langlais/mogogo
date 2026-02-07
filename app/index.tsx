import { View, Text, Pressable, StyleSheet } from "react-native";
import { Image } from "expo-image";
import { useRouter } from "expo-router";
import { useTranslation } from "react-i18next";
import { useTheme } from "@/contexts/ThemeContext";
import type { ThemeColors } from "@/constants";

export default function HomeScreen() {
  const router = useRouter();
  const { t } = useTranslation();
  const { colors } = useTheme();
  const s = getStyles(colors);

  return (
    <View style={s.container}>
      <Image
        source={require("../assets/images/mogogo-waiting.png")}
        style={s.mascot}
        contentFit="contain"
        autoplay={true}
      />
      <Text style={s.title}>Mogogo</Text>
      <Text style={s.subtitle}>{t("home.subtitle")}</Text>
      <Pressable style={s.button} onPress={() => router.push("/(auth)/login")}>
        <Text style={s.buttonText}>{t("home.start")}</Text>
      </Pressable>
    </View>
  );
}

const getStyles = (colors: ThemeColors) =>
  StyleSheet.create({
    container: {
      flex: 1,
      justifyContent: "center",
      alignItems: "center",
      backgroundColor: colors.background,
    },
    mascot: {
      width: 200,
      height: 200,
      marginBottom: 16,
      backgroundColor: "transparent",
    },
    title: {
      fontSize: 48,
      fontWeight: "bold",
      color: colors.text,
      marginBottom: 8,
    },
    subtitle: {
      fontSize: 18,
      color: colors.textSecondary,
      marginBottom: 32,
    },
    button: {
      backgroundColor: colors.primary,
      paddingHorizontal: 32,
      paddingVertical: 16,
      borderRadius: 12,
    },
    buttonText: {
      color: colors.white,
      fontSize: 18,
      fontWeight: "600",
    },
  });
