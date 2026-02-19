import { useState, useEffect } from "react";
import { View, Text, Pressable, StyleSheet, ScrollView } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Image } from "expo-image";
import { useRouter } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import { useTranslation } from "react-i18next";
import { useTheme } from "@/contexts/ThemeContext";
import { useOnboarding } from "./_layout";
import { checkLocationPermission, requestLocationPermission } from "@/hooks/useLocation";
import type { ThemeColors } from "@/constants";

export const ONBOARDING_DONE_KEY = "mogogo_onboarding_done";

export default function PermissionsScreen() {
  const router = useRouter();
  const { t } = useTranslation();
  const { colors } = useTheme();
  const insets = useSafeAreaInsets();
  const s = getStyles(colors);

  const { markOnboardingDone } = useOnboarding();
  const [locationGranted, setLocationGranted] = useState(false);

  // Vérifier l'état initial de la permission de localisation
  useEffect(() => {
    checkLocationPermission().then(setLocationGranted);
  }, []);

  const handleAllowLocation = async () => {
    const granted = await requestLocationPermission();
    setLocationGranted(granted);
  };

  const handleNext = () => {
    markOnboardingDone();
    router.replace("/(main)/training");
  };

  const handleSkip = () => {
    markOnboardingDone();
    router.replace("/(main)/home");
  };

  const handleBack = () => {
    router.back();
  };

  return (
    <View style={[s.container, { paddingTop: insets.top, paddingBottom: insets.bottom }]}>
      {/* Header */}
      <View style={s.header}>
        <Pressable onPress={handleBack} style={s.headerButton}>
          <Ionicons name="arrow-back" size={22} color={colors.text} />
        </Pressable>
        <Text style={s.stepText}>{t("permissions.step", { current: 1, total: 2 })}</Text>
        <Pressable onPress={handleSkip} style={s.headerButton}>
          <Text style={s.skipText}>{t("permissions.skip")}</Text>
        </Pressable>
      </View>

      <ScrollView contentContainerStyle={s.scrollContent} style={{ flex: 1 }}>
        {/* Mascotte */}
        <View style={s.mascotContainer}>
          <Image
            source={require("../assets/animations/startup/mogogo-accueil.webp")}
            style={s.mascot}
            contentFit="contain"
            autoplay={true}
          />
        </View>

        {/* Titre & sous-titre */}
        <Text style={s.title}>{t("permissions.screenTitle")}</Text>
        <Text style={s.subtitle}>{t("permissions.screenSubtitle")}</Text>

        {/* Carte localisation (Requis) */}
        <View style={s.card}>
          <View style={s.cardHeader}>
            <View style={[s.iconCircle, { backgroundColor: "#7C3AED20" }]}>
              <Ionicons name="location" size={22} color="#7C3AED" />
            </View>
            <View style={s.cardHeaderText}>
              <View style={s.titleRow}>
                <Text style={s.cardTitle}>{t("permissions.locationTitle")}</Text>
                <View style={s.badgeRequired}>
                  <Text style={s.badgeRequiredText}>{t("permissions.required")}</Text>
                </View>
              </View>
              <Text style={s.cardDescription}>{t("permissions.locationDescription")}</Text>
            </View>
          </View>
          <Pressable
            style={[s.allowButton, locationGranted && s.allowButtonGranted]}
            onPress={handleAllowLocation}
            disabled={locationGranted}
          >
            {locationGranted ? (
              <>
                <Ionicons name="checkmark-circle" size={18} color="#2ECC71" />
                <Text style={s.allowButtonGrantedText}>{t("permissions.locationGranted")}</Text>
              </>
            ) : (
              <Text style={s.allowButtonText}>{t("permissions.locationAllow")}</Text>
            )}
          </Pressable>
        </View>

        {/* Footer vie privée */}
        <Text style={s.privacyFooter}>{t("permissions.privacyFooter")}</Text>
      </ScrollView>

      {/* Barre de navigation bas */}
      <View style={s.footer}>
        <Pressable style={s.footerBack} onPress={handleBack}>
          <Ionicons name="arrow-back" size={18} color={colors.textSecondary} />
          <Text style={s.footerBackText}>{t("permissions.back")}</Text>
        </Pressable>
        <Pressable style={s.footerNext} onPress={handleNext}>
          <Text style={s.footerNextText}>{t("permissions.next")}</Text>
        </Pressable>
      </View>
    </View>
  );
}

const getStyles = (colors: ThemeColors) =>
  StyleSheet.create({
    container: {
      flex: 1,
    },
    header: {
      flexDirection: "row",
      alignItems: "center",
      justifyContent: "space-between",
      paddingHorizontal: 20,
      paddingVertical: 12,
    },
    headerButton: {
      padding: 4,
    },
    stepText: {
      fontSize: 14,
      color: colors.textSecondary,
    },
    skipText: {
      fontSize: 14,
      color: colors.textSecondary,
    },
    scrollContent: {
      paddingHorizontal: 24,
      paddingBottom: 16,
    },
    mascotContainer: {
      alignItems: "center",
      marginBottom: 16,
    },
    mascot: {
      width: 100,
      height: 100,
      backgroundColor: "transparent",
    },
    title: {
      fontSize: 24,
      fontWeight: "bold",
      color: colors.text,
      textAlign: "center",
      marginBottom: 8,
    },
    subtitle: {
      fontSize: 14,
      color: colors.textSecondary,
      textAlign: "center",
      lineHeight: 20,
      marginBottom: 24,
      paddingHorizontal: 8,
    },
    card: {
      backgroundColor: colors.surface,
      borderRadius: 16,
      borderWidth: 1,
      borderColor: colors.border,
      padding: 16,
      marginBottom: 12,
    },
    cardHeader: {
      flexDirection: "row",
      gap: 12,
      marginBottom: 12,
    },
    iconCircle: {
      width: 44,
      height: 44,
      borderRadius: 22,
      justifyContent: "center",
      alignItems: "center",
    },
    cardHeaderText: {
      flex: 1,
    },
    titleRow: {
      flexDirection: "row",
      alignItems: "center",
      gap: 8,
      marginBottom: 4,
    },
    cardTitle: {
      fontSize: 16,
      fontWeight: "600",
      color: colors.text,
    },
    badgeRequired: {
      backgroundColor: "#EF444420",
      paddingHorizontal: 8,
      paddingVertical: 2,
      borderRadius: 8,
    },
    badgeRequiredText: {
      fontSize: 11,
      fontWeight: "600",
      color: "#EF4444",
    },
    cardDescription: {
      fontSize: 13,
      color: colors.textSecondary,
      lineHeight: 18,
    },
    allowButton: {
      flexDirection: "row",
      alignItems: "center",
      justifyContent: "center",
      gap: 6,
      paddingVertical: 10,
      borderRadius: 10,
      borderWidth: 1,
      borderColor: colors.primary,
    },
    allowButtonGranted: {
      borderColor: "#2ECC71",
      backgroundColor: "#2ECC7110",
    },
    allowButtonText: {
      fontSize: 14,
      fontWeight: "600",
      color: colors.primary,
    },
    allowButtonGrantedText: {
      fontSize: 14,
      fontWeight: "600",
      color: "#2ECC71",
    },
    privacyFooter: {
      fontSize: 12,
      color: colors.textSecondary,
      textAlign: "center",
      marginTop: 8,
      lineHeight: 18,
    },
    footer: {
      flexDirection: "row",
      alignItems: "center",
      justifyContent: "space-between",
      paddingHorizontal: 24,
      paddingVertical: 16,
      borderTopWidth: 1,
      borderTopColor: colors.border,
    },
    footerBack: {
      flexDirection: "row",
      alignItems: "center",
      gap: 6,
      paddingVertical: 12,
      paddingHorizontal: 16,
    },
    footerBackText: {
      fontSize: 16,
      color: colors.textSecondary,
    },
    footerNext: {
      backgroundColor: colors.primary,
      paddingVertical: 12,
      paddingHorizontal: 32,
      borderRadius: 12,
    },
    footerNextText: {
      fontSize: 16,
      fontWeight: "600",
      color: colors.white,
    },
  });
