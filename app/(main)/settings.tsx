import { useState, useRef, useEffect } from "react";
import { View, Text, Pressable, StyleSheet, Alert, ActivityIndicator, ScrollView, TextInput, Animated } from "react-native";
import { useRouter } from "expo-router";
import { useTranslation } from "react-i18next";
import ConfettiCannon from "react-native-confetti-cannon";
import { useAuth } from "@/hooks/useAuth";
import { usePurchases } from "@/hooks/usePurchases";
import { usePlumes } from "@/contexts/PlumesContext";
import { redeemPromoCode, type PromoResult } from "@/services/history";
import { setDevicePremium } from "@/services/plumes";
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
  const { refresh: refreshPlumes } = usePlumes();
  const router = useRouter();
  const currentLang = getCurrentLanguage();
  const { colors, preference, setPreference } = useTheme();
  const s = getStyles(colors);

  const handleLanguageChange = async (lang: SupportedLanguage) => {
    await changeLanguage(lang);
  };

  const [deleting, setDeleting] = useState(false);
  const [promoCode, setPromoCode] = useState("");
  const [promoLoading, setPromoLoading] = useState(false);
  const [promoResult, setPromoResult] = useState<null | "success" | "premium_granted" | "invalid_code" | "already_redeemed" | "no_device_id" | "server_error" | "too_many_attempts">(null);
  const [promoBonus, setPromoBonus] = useState(0);
  const [failedAttempts, setFailedAttempts] = useState(0);
  const [cooldownEnd, setCooldownEnd] = useState<number | null>(null);
  const [cooldownRemaining, setCooldownRemaining] = useState(0);
  const [showConfetti, setShowConfetti] = useState(false);
  const shimmerAnim = useRef(new Animated.Value(1)).current;

  useEffect(() => {
    if (!cooldownEnd) return;
    const tick = setInterval(() => {
      const remaining = Math.ceil((cooldownEnd - Date.now()) / 1000);
      if (remaining <= 0) {
        setCooldownEnd(null);
        setCooldownRemaining(0);
        setFailedAttempts(0);
      } else {
        setCooldownRemaining(remaining);
      }
    }, 1000);
    return () => clearInterval(tick);
  }, [cooldownEnd]);

  useEffect(() => {
    if (promoResult === "success" || promoResult === "premium_granted") {
      Animated.loop(
        Animated.sequence([
          Animated.timing(shimmerAnim, { toValue: 0.3, duration: 600, useNativeDriver: true }),
          Animated.timing(shimmerAnim, { toValue: 1, duration: 600, useNativeDriver: true }),
        ]),
      ).start();
    } else {
      shimmerAnim.setValue(1);
    }
  }, [promoResult]);

  const handlePromoSubmit = async () => {
    if (!promoCode.trim() || promoLoading || cooldownEnd) return;
    setPromoLoading(true);
    setPromoResult(null);
    try {
      const result = await redeemPromoCode(promoCode);
      if (result.type === "premium") {
        setPromoResult("premium_granted");
        await setDevicePremium(true);
        await refreshPlumes();
      } else {
        setPromoBonus(result.bonus);
        setPromoResult("success");
      }
      setPromoCode("");
      setFailedAttempts(0);
      setShowConfetti(true);
    } catch (e: any) {
      const msg = e.message as string;
      if (msg === "too_many_attempts") {
        setPromoResult("too_many_attempts");
        setCooldownEnd(Date.now() + 60_000);
      } else if (msg === "invalid_code" || msg === "already_redeemed" || msg === "no_device_id" || msg === "server_error") {
        setPromoResult(msg);
        if (msg === "invalid_code") {
          const next = failedAttempts + 1;
          setFailedAttempts(next);
          if (next >= 3) {
            setCooldownEnd(Date.now() + 60_000);
          }
        }
      } else {
        setPromoResult("server_error");
      }
    } finally {
      setPromoLoading(false);
    }
  };

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

        <Text style={s.sectionTitle}>{t("settings.promoTitle")}</Text>
        <View style={s.list}>
          <View style={s.promoRow}>
            <TextInput
              style={s.promoInput}
              value={promoCode}
              onChangeText={setPromoCode}
              placeholder={t("settings.promoPlaceholder")}
              placeholderTextColor={colors.textSecondary}
              autoCapitalize="characters"
              maxLength={20}
              editable={!promoLoading && !cooldownEnd}
            />
            <Pressable
              style={[s.promoButton, (!promoCode.trim() || promoLoading || !!cooldownEnd) && s.promoButtonDisabled]}
              onPress={handlePromoSubmit}
              disabled={!promoCode.trim() || promoLoading || !!cooldownEnd}
            >
              {promoLoading ? (
                <ActivityIndicator color="#FFFFFF" size="small" />
              ) : cooldownEnd ? (
                <Text style={s.promoButtonText}>{cooldownRemaining}s</Text>
              ) : (
                <Text style={s.promoButtonText}>{t("settings.promoActivate")}</Text>
              )}
            </Pressable>
          </View>
          {promoResult === "success" && (
            <Animated.Text style={[s.promoFeedback, s.promoSuccess, { opacity: shimmerAnim }]}>
              {t("settings.promoSuccess", { count: promoBonus })}
            </Animated.Text>
          )}
          {promoResult === "premium_granted" && (
            <Animated.Text style={[s.promoFeedback, s.promoSuccess, { opacity: shimmerAnim }]}>
              {t("settings.promoPremiumGranted")}
            </Animated.Text>
          )}
          {promoResult === "invalid_code" && (
            <Text style={[s.promoFeedback, s.promoError]}>{t("settings.promoInvalid")}</Text>
          )}
          {promoResult === "already_redeemed" && (
            <Text style={[s.promoFeedback, s.promoError]}>{t("settings.promoAlreadyUsed")}</Text>
          )}
          {promoResult === "no_device_id" && (
            <Text style={[s.promoFeedback, s.promoError]}>{t("settings.promoNoDevice")}</Text>
          )}
          {promoResult === "too_many_attempts" && (
            <Text style={[s.promoFeedback, s.promoError]}>{t("settings.promoTooManyAttempts")}</Text>
          )}
          {promoResult === "server_error" && (
            <Text style={[s.promoFeedback, s.promoError]}>{t("settings.promoError")}</Text>
          )}
        </View>

        {showConfetti && (
          <ConfettiCannon
            count={80}
            origin={{ x: -10, y: 0 }}
            autoStart
            fadeOut
            onAnimationEnd={() => setShowConfetti(false)}
          />
        )}

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
    promoRow: {
      flexDirection: "row",
      alignItems: "center",
      gap: 8,
    },
    promoInput: {
      flex: 1,
      padding: 14,
      borderRadius: 12,
      borderWidth: 1,
      borderColor: colors.border,
      backgroundColor: colors.background,
      fontSize: 16,
      color: colors.text,
      fontWeight: "600",
      letterSpacing: 1,
    },
    promoButton: {
      paddingHorizontal: 20,
      paddingVertical: 14,
      borderRadius: 12,
      backgroundColor: colors.primary,
    },
    promoButtonDisabled: {
      opacity: 0.5,
    },
    promoButtonText: {
      color: "#FFFFFF",
      fontSize: 16,
      fontWeight: "600",
    },
    promoFeedback: {
      fontSize: 14,
      marginTop: 8,
      textAlign: "center",
    },
    promoSuccess: {
      color: "#16A34A",
      fontWeight: "600",
    },
    promoError: {
      color: "#DC2626",
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
