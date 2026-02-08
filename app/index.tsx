import { View, Text, Pressable, StyleSheet } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Image } from "expo-image";
import { useRouter } from "expo-router";
import { useTranslation } from "react-i18next";
import { useTheme } from "@/contexts/ThemeContext";
import { changeLanguage, getCurrentLanguage, type SupportedLanguage } from "@/i18n";
import type { ThemeColors } from "@/constants";

const LANGUAGES: { key: SupportedLanguage; flag: string }[] = [
  { key: "fr", flag: "🇫🇷" },
  { key: "en", flag: "🇬🇧" },
  { key: "es", flag: "🇪🇸" },
];

export default function HomeScreen() {
  const router = useRouter();
  const { t } = useTranslation();
  const { colors } = useTheme();
  const insets = useSafeAreaInsets();
  const s = getStyles(colors);
  const currentLang = getCurrentLanguage();

  const handleCycleLanguage = async () => {
    const currentIndex = LANGUAGES.findIndex((l) => l.key === currentLang);
    const nextIndex = (currentIndex + 1) % LANGUAGES.length;
    await changeLanguage(LANGUAGES[nextIndex].key);
  };

  const currentFlag = LANGUAGES.find((l) => l.key === currentLang)?.flag ?? "🌐";

  return (
    <View style={[s.container, { paddingBottom: insets.bottom }]}>
      <Pressable style={s.langButton} onPress={handleCycleLanguage}>
        <Text style={s.langFlag}>{currentFlag}</Text>
      </Pressable>
      <Image
        source={require("../assets/animations/startup/mogogo-accueil.webp")}
        style={s.mascot}
        contentFit="contain"
        autoplay={true}
      />
      <Text style={s.title}>Mogogo</Text>
      <Text style={s.subtitle}>{t("home.subtitle")}</Text>
      <Pressable style={s.button} onPress={() => router.push("/(auth)/login")}>
        <Text style={s.buttonText}>{t("home.start")}</Text>
      </Pressable>
      <Text style={s.privacyNote}>{t("home.privacyNote")}</Text>
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
    langButton: {
      position: "absolute",
      top: 56,
      right: 24,
      width: 44,
      height: 44,
      borderRadius: 22,
      backgroundColor: colors.surface,
      borderWidth: 1,
      borderColor: colors.border,
      justifyContent: "center",
      alignItems: "center",
    },
    langFlag: {
      fontSize: 22,
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
    privacyNote: {
      fontSize: 12,
      color: colors.textSecondary,
      textAlign: "center",
      marginTop: 24,
      paddingHorizontal: 32,
      lineHeight: 18,
    },
  });
