import { useState } from "react";
import { View, Text, Pressable, StyleSheet, Alert, ActivityIndicator } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Image } from "expo-image";
import { useTranslation } from "react-i18next";
import { useAuth } from "@/hooks/useAuth";
import { useTheme } from "@/contexts/ThemeContext";
import { changeLanguage, getCurrentLanguage, type SupportedLanguage } from "@/i18n";
import type { ThemeColors } from "@/constants";

const LANGUAGES: { key: SupportedLanguage; flag: string }[] = [
  { key: "fr", flag: "\uD83C\uDDEB\uD83C\uDDF7" },
  { key: "en", flag: "\uD83C\uDDEC\uD83C\uDDE7" },
  { key: "es", flag: "\uD83C\uDDEA\uD83C\uDDF8" },
];

export default function HomeScreen() {
  const { t } = useTranslation();
  const { signInWithGoogle } = useAuth();
  const { colors } = useTheme();
  const insets = useSafeAreaInsets();
  const s = getStyles(colors);
  const currentLang = getCurrentLanguage();
  const [signingIn, setSigningIn] = useState(false);

  const handleCycleLanguage = async () => {
    const currentIndex = LANGUAGES.findIndex((l) => l.key === currentLang);
    const nextIndex = (currentIndex + 1) % LANGUAGES.length;
    await changeLanguage(LANGUAGES[nextIndex].key);
  };

  const handleGoogleLogin = async () => {
    setSigningIn(true);
    try {
      await signInWithGoogle();
    } catch (error: any) {
      Alert.alert(t("login.errorTitle"), error.message ?? t("login.errorDefault"));
    } finally {
      setSigningIn(false);
    }
  };

  const currentFlag = LANGUAGES.find((l) => l.key === currentLang)?.flag ?? "\uD83C\uDF10";

  return (
    <View style={[s.container, { paddingTop: insets.top, paddingBottom: insets.bottom }]}>
      {/* Bouton langue */}
      <Pressable style={s.langButton} onPress={handleCycleLanguage}>
        <Text style={s.langFlag}>{currentFlag}</Text>
      </Pressable>

      <View style={s.content}>
        {/* Mascotte dans un cadre sombre */}
        <View style={s.mascotFrame}>
          <Image
            source={require("../assets/animations/startup/mogogo-accueil.webp")}
            style={s.mascot}
            contentFit="contain"
            autoplay={true}
          />
        </View>

        {/* Titre et sous-titre */}
        <Text style={s.title}>Mogogo</Text>
        <Text style={s.subtitle}>{t("home.subtitle")}</Text>
        <Text style={s.description}>{t("home.description")}</Text>

        {/* Bouton Google Sign-In */}
        <Pressable
          style={[s.googleButton, signingIn && s.googleButtonDisabled]}
          onPress={handleGoogleLogin}
          disabled={signingIn}
        >
          {signingIn ? (
            <ActivityIndicator color={colors.white} />
          ) : (
            <>
              <Text style={s.googleIcon}>G</Text>
              <Text style={s.googleButtonText}>{t("login.continueGoogle")}</Text>
            </>
          )}
        </Pressable>

        {/* Note vie privée */}
        <Text style={s.privacyNote}>{t("home.privacyNote")}</Text>
      </View>
    </View>
  );
}

const getStyles = (colors: ThemeColors) =>
  StyleSheet.create({
    container: {
      flex: 1,
    },
    content: {
      flex: 1,
      justifyContent: "center",
      alignItems: "center",
      paddingHorizontal: 32,
    },
    langButton: {
      position: "absolute",
      top: 56,
      right: 24,
      zIndex: 10,
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
    mascotFrame: {
      width: 160,
      height: 160,
      borderRadius: 20,
      backgroundColor: colors.surface,
      borderWidth: 1,
      borderColor: colors.border,
      justifyContent: "center",
      alignItems: "center",
      marginBottom: 24,
    },
    mascot: {
      width: 130,
      height: 130,
      backgroundColor: "transparent",
    },
    title: {
      fontSize: 36,
      fontWeight: "bold",
      color: colors.text,
      marginBottom: 6,
      letterSpacing: 1,
    },
    subtitle: {
      fontSize: 16,
      fontStyle: "italic",
      color: colors.primary,
      marginBottom: 12,
    },
    description: {
      fontSize: 14,
      color: colors.textSecondary,
      textAlign: "center",
      lineHeight: 20,
      marginBottom: 32,
      paddingHorizontal: 8,
    },
    googleButton: {
      flexDirection: "row",
      alignItems: "center",
      justifyContent: "center",
      gap: 10,
      width: "100%",
      paddingVertical: 16,
      borderRadius: 14,
      backgroundColor: colors.primary,
    },
    googleButtonDisabled: {
      opacity: 0.6,
    },
    googleIcon: {
      fontSize: 18,
      fontWeight: "bold",
      color: colors.white,
    },
    googleButtonText: {
      fontSize: 16,
      fontWeight: "600",
      color: colors.white,
    },
    privacyNote: {
      fontSize: 12,
      color: colors.textSecondary,
      textAlign: "center",
      marginTop: 20,
      lineHeight: 18,
      paddingHorizontal: 8,
    },
  });
