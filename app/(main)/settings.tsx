import { useState } from "react";
import { View, Text, Pressable, StyleSheet, Alert, ActivityIndicator, ScrollView } from "react-native";
import { useRouter } from "expo-router";
import { useTranslation } from "react-i18next";
import { useAuth } from "@/hooks/useAuth";
import { usePurchases } from "@/hooks/usePurchases";
import { supabase } from "@/services/supabase";
import { changeLanguage, getCurrentLanguage, type SupportedLanguage } from "@/i18n";
import { useTheme, type ThemePreference } from "@/contexts/ThemeContext";
import type { ThemeColors } from "@/constants";


const LANGUAGES: { key: SupportedLanguage; label: string; flag: string }[] = [
  { key: "fr", label: "Français", flag: "🇫🇷" },
  { key: "en", label: "English", flag: "🇬🇧" },
  { key: "es", label: "Español", flag: "🇪🇸" },
];

const THEMES: { key: ThemePreference; icon: string; labelKey: string }[] = [
  { key: "system", icon: "📱", labelKey: "settings.themeSystem" },
  { key: "light", icon: "☀️", labelKey: "settings.themeLight" },
  { key: "dark", icon: "🌙", labelKey: "settings.themeDark" },
];

export default function SettingsScreen() {
  const { t } = useTranslation();
  const { signOut } = useAuth();
  const { isPremium, showPaywall, showCustomerCenter, restore } = usePurchases();
  const router = useRouter();
  const currentLang = getCurrentLanguage();
  const { colors, preference, setPreference } = useTheme();
  const s = getStyles(colors);

  const handleLanguageChange = async (lang: SupportedLanguage) => {
    await changeLanguage(lang);
  };

  const [deleting, setDeleting] = useState(false);

  const handleSignOut = async () => {
    try {
      await signOut();
      router.replace("/");
    } catch (error: any) {
      Alert.alert(t("login.errorTitle"), error.message);
    }
  };

  const handleDeleteAccount = () => {
    Alert.alert(
      t("settings.deleteConfirmTitle"),
      t("settings.deleteConfirmMessage"),
      [
        { text: t("settings.cancel"), style: "cancel" },
        {
          text: t("settings.deleteConfirmButton"),
          style: "destructive",
          onPress: async () => {
            setDeleting(true);
            try {
              const { error } = await supabase.functions.invoke("delete-account", {
                method: "POST",
              });
              if (error) throw error;
              await signOut();
              router.replace("/");
            } catch (error: any) {
              Alert.alert(t("login.errorTitle"), error.message ?? t("common.unknownError"));
            } finally {
              setDeleting(false);
            }
          },
        },
      ],
    );
  };

  return (
    <View style={s.container}>
      <ScrollView contentContainerStyle={s.scrollContent}>
        <Text style={s.sectionTitle}>{t("settings.language")}</Text>
        <View style={s.list}>
          {LANGUAGES.map((lang) => (
            <Pressable
              key={lang.key}
              style={[s.row, currentLang === lang.key && s.rowActive]}
              onPress={() => handleLanguageChange(lang.key)}
            >
              <Text style={s.icon}>{lang.flag}</Text>
              <Text style={[s.label, currentLang === lang.key && s.labelActive]}>
                {lang.label}
              </Text>
              {currentLang === lang.key && (
                <Text style={s.check}>✓</Text>
              )}
            </Pressable>
          ))}
        </View>

        <Text style={s.sectionTitle}>{t("settings.theme")}</Text>
        <View style={s.list}>
          {THEMES.map((theme) => (
            <Pressable
              key={theme.key}
              style={[s.row, preference === theme.key && s.rowActive]}
              onPress={() => setPreference(theme.key)}
            >
              <Text style={s.icon}>{theme.icon}</Text>
              <Text style={[s.label, preference === theme.key && s.labelActive]}>
                {t(theme.labelKey)}
              </Text>
              {preference === theme.key && (
                <Text style={s.check}>✓</Text>
              )}
            </Pressable>
          ))}
        </View>

        <Text style={s.sectionTitle}>{t("training.title")}</Text>
        <View style={s.list}>
          <Pressable style={s.row} onPress={() => router.push("/(main)/training")}>
            <Text style={s.icon}>{"\uD83E\uDDD9"}</Text>
            <Text style={s.label}>{t("training.settingsButton")}</Text>
            <Text style={{ fontSize: 18, color: colors.textSecondary }}>{"\u203A"}</Text>
          </Pressable>
        </View>

        <Text style={s.sectionTitle}>{t("settings.subscription")}</Text>
        <View style={s.list}>
          {isPremium ? (
            <>
              <View style={[s.row, s.rowActive]}>
                <Text style={s.icon}>{"\u2B50"}</Text>
                <Text style={[s.label, s.labelActive]}>{t("settings.premiumActive")}</Text>
              </View>
              <Pressable style={s.row} onPress={showCustomerCenter}>
                <Text style={s.icon}>{"\u2699\uFE0F"}</Text>
                <Text style={s.label}>{t("settings.manageSubscription")}</Text>
                <Text style={{ fontSize: 18, color: colors.textSecondary }}>{"\u203A"}</Text>
              </Pressable>
            </>
          ) : (
            <>
              <Pressable style={[s.row, s.premiumRow]} onPress={showPaywall}>
                <Text style={s.icon}>{"\uD83D\uDC51"}</Text>
                <Text style={[s.label, { color: "#FFFFFF", fontWeight: "600" }]}>{t("settings.upgradePremium")}</Text>
                <Text style={{ fontSize: 18, color: "#FFFFFF" }}>{"\u203A"}</Text>
              </Pressable>
              <Pressable style={s.row} onPress={restore}>
                <Text style={s.icon}>{"\uD83D\uDD04"}</Text>
                <Text style={s.label}>{t("settings.restorePurchases")}</Text>
              </Pressable>
            </>
          )}
        </View>

        <Pressable style={s.signOutButton} onPress={handleSignOut}>
          <Text style={s.signOutText}>{t("settings.signOut")}</Text>
        </Pressable>

        <Pressable
          style={s.deleteButton}
          onPress={handleDeleteAccount}
          disabled={deleting}
        >
          {deleting ? (
            <ActivityIndicator color="#DC2626" />
          ) : (
            <Text style={s.deleteText}>{t("settings.deleteAccount")}</Text>
          )}
        </Pressable>
      </ScrollView>
    </View>
  );
}

const getStyles = (colors: ThemeColors) =>
  StyleSheet.create({
    container: {
      flex: 1,
      backgroundColor: colors.background,
    },
    scrollContent: {
      padding: 24,
      paddingBottom: 24,
    },
    sectionTitle: {
      fontSize: 18,
      fontWeight: "600",
      marginBottom: 16,
      color: colors.text,
    },
    list: {
      gap: 8,
      marginBottom: 40,
    },
    row: {
      flexDirection: "row",
      alignItems: "center",
      padding: 16,
      borderRadius: 12,
      borderWidth: 1,
      borderColor: colors.border,
      backgroundColor: colors.background,
    },
    rowActive: {
      borderColor: colors.primary,
      backgroundColor: colors.surface,
    },
    icon: {
      fontSize: 24,
      marginRight: 12,
    },
    label: {
      fontSize: 16,
      color: colors.text,
      flex: 1,
    },
    labelActive: {
      fontWeight: "600",
      color: colors.primary,
    },
    check: {
      fontSize: 18,
      color: colors.primary,
      fontWeight: "bold",
    },
    premiumRow: {
      backgroundColor: colors.primary,
      borderColor: colors.primary,
    },
    signOutButton: {
      padding: 16,
      borderRadius: 12,
      borderWidth: 1,
      borderColor: colors.border,
      alignItems: "center",
    },
    signOutText: {
      fontSize: 16,
      color: colors.textSecondary,
      fontWeight: "500",
    },
    deleteButton: {
      padding: 16,
      borderRadius: 12,
      borderWidth: 1,
      borderColor: "#DC2626",
      alignItems: "center",
      marginTop: 16,
    },
    deleteText: {
      fontSize: 16,
      color: "#DC2626",
      fontWeight: "500",
    },
  });
