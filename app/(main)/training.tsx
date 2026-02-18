import { useState } from "react";
import { View, Text, Pressable, StyleSheet, ScrollView } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Image } from "expo-image";
import { useRouter } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import { useTranslation } from "react-i18next";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { useTheme } from "@/contexts/ThemeContext";
import { useGrimoire } from "@/hooks/useGrimoire";
import { useSubscriptions } from "@/hooks/useSubscriptions";
import { TAG_CATALOG, ALL_TAG_SLUGS } from "@/constants/tags";
import { SERVICES_CATALOG, MAX_SERVICES_PER_CATEGORY, getCategoryForSlug } from "@/services/subscriptions";
import type { ThemeColors } from "@/constants";

const TOTAL_STEPS = 3; // permissions (done) + vibe + services

export default function TrainingScreen() {
  const { t } = useTranslation();
  const router = useRouter();
  const { colors } = useTheme();
  const insets = useSafeAreaInsets();
  const { boostTags, penalizeTags } = useGrimoire();
  const { services, toggle: toggleService, countInCategory } = useSubscriptions();
  const s = getStyles(colors);

  const [step, setStep] = useState<1 | 2>(1);
  const [liked, setLiked] = useState<Set<string>>(new Set());
  const [skipped, setSkipped] = useState<Set<string>>(new Set());

  const toggleLiked = (slug: string) => {
    setLiked((prev) => {
      const next = new Set(prev);
      if (next.has(slug)) {
        next.delete(slug);
      } else {
        next.add(slug);
        setSkipped((s) => { const n = new Set(s); n.delete(slug); return n; });
      }
      return next;
    });
  };

  const toggleSkipped = (slug: string) => {
    setSkipped((prev) => {
      const next = new Set(prev);
      if (next.has(slug)) {
        next.delete(slug);
      } else {
        next.add(slug);
        setLiked((s) => { const n = new Set(s); n.delete(slug); return n; });
      }
      return next;
    });
  };

  const handleVibeNext = async () => {
    // Sauvegarder les préférences vibe, puis passer à l'étape services
    if (liked.size > 0) {
      await boostTags(Array.from(liked));
    }
    if (skipped.size > 0) {
      await penalizeTags(Array.from(skipped));
    }
    setStep(2);
  };

  const handleFinish = async () => {
    await AsyncStorage.setItem("mogogo_training_completed", "true");
    router.back();
  };

  const handleSkip = async () => {
    await AsyncStorage.setItem("mogogo_training_completed", "true");
    router.back();
  };

  const handleBack = () => {
    if (step === 2) {
      setStep(1);
    } else {
      router.back();
    }
  };

  // Dot actif : permissions=0 (fait), vibe=1, services=2
  const activeDotIndex = step; // step 1 → dot index 1, step 2 → dot index 2

  const serviceSet = new Set(services);

  return (
    <View style={[s.container, { paddingTop: insets.top, paddingBottom: insets.bottom }]}>
      {/* Header */}
      <View style={s.header}>
        <Pressable onPress={handleBack} style={s.headerButton}>
          <Ionicons name="arrow-back" size={22} color={colors.text} />
        </Pressable>
        <View style={s.stepDots}>
          {Array.from({ length: TOTAL_STEPS }).map((_, i) => (
            <View key={i} style={[s.dot, i <= activeDotIndex && s.dotActive]} />
          ))}
        </View>
        <Pressable onPress={handleSkip} style={s.headerButton}>
          <Text style={s.skipText}>{t("training.skip")}</Text>
        </Pressable>
      </View>

      {step === 1 ? (
        /* ── Étape 1 : Vibe ── */
        <ScrollView contentContainerStyle={s.scrollContent} style={{ flex: 1 }}>
          <View style={s.mascotContainer}>
            <Image
              source={require("../../assets/animations/startup/mogogo-accueil.webp")}
              style={s.mascot}
              contentFit="contain"
              autoplay={true}
            />
          </View>

          <Text style={s.title}>{t("training.vibeTitle")}</Text>
          <Text style={s.subtitle}>{t("training.vibeSubtitle")}</Text>

          <View style={s.sectionHeader}>
            <Text style={s.sectionTitle}>{t("training.interestsLabel")}</Text>
            <Text style={s.sectionCount}>
              {liked.size} {t("training.selected")}
            </Text>
          </View>
          <View style={s.chipsContainer}>
            {ALL_TAG_SLUGS.map((slug) => {
              const tag = TAG_CATALOG[slug];
              const active = liked.has(slug);
              return (
                <Pressable
                  key={slug}
                  style={[s.chip, active && s.chipActive]}
                  onPress={() => toggleLiked(slug)}
                >
                  <Text style={s.chipEmoji}>{tag.emoji}</Text>
                  <Text style={[s.chipLabel, active && s.chipLabelActive]}>
                    {t(tag.labelKey)}
                  </Text>
                </Pressable>
              );
            })}
          </View>

          <View style={s.sectionHeader}>
            <Text style={s.sectionTitle}>
              {t("training.skipLabel")}{" "}
              <Text style={s.optionalBadge}>({t("permissions.optional")})</Text>
            </Text>
            <Text style={s.sectionCount}>
              {skipped.size} {t("training.skippedCount")}
            </Text>
          </View>
          <View style={s.chipsContainer}>
            {ALL_TAG_SLUGS.map((slug) => {
              const tag = TAG_CATALOG[slug];
              const active = skipped.has(slug);
              return (
                <Pressable
                  key={slug}
                  style={[s.chip, active && s.chipSkipped]}
                  onPress={() => toggleSkipped(slug)}
                >
                  <Text style={s.chipEmoji}>{tag.emoji}</Text>
                  <Text style={[s.chipLabel, active && s.chipLabelActive]}>
                    {t(tag.labelKey)}
                  </Text>
                </Pressable>
              );
            })}
          </View>
        </ScrollView>
      ) : (
        /* ── Étape 2 : Services streaming ── */
        <ScrollView contentContainerStyle={s.scrollContent} style={{ flex: 1 }}>
          <View style={s.mascotContainer}>
            <Image
              source={require("../../assets/animations/startup/mogogo-accueil.webp")}
              style={s.mascot}
              contentFit="contain"
              autoplay={true}
            />
          </View>

          <Text style={s.title}>{t("training.servicesTitle")}</Text>
          <Text style={s.subtitle}>{t("training.servicesSubtitle")}</Text>

          <View style={s.sectionHeader}>
            <Text style={s.sectionTitle}>
              {t("grimoire.servicesVideo")} ({countInCategory("video")}/{MAX_SERVICES_PER_CATEGORY})
            </Text>
          </View>
          <View style={s.chipsContainer}>
            {SERVICES_CATALOG.video.map((svc) => {
              const active = serviceSet.has(svc.slug);
              const full = !active && countInCategory("video") >= MAX_SERVICES_PER_CATEGORY;
              return (
                <Pressable
                  key={svc.slug}
                  style={[s.chip, active && s.chipActive, full && s.chipDisabled]}
                  onPress={() => toggleService(svc.slug)}
                  disabled={full}
                >
                  <Text style={s.chipEmoji}>{svc.emoji}</Text>
                  <Text style={[s.chipLabel, active && s.chipLabelActive, full && s.chipLabelDisabled]}>
                    {svc.label}
                  </Text>
                </Pressable>
              );
            })}
          </View>

          <View style={s.sectionHeader}>
            <Text style={s.sectionTitle}>
              {t("grimoire.servicesMusic")} ({countInCategory("music")}/{MAX_SERVICES_PER_CATEGORY})
            </Text>
          </View>
          <View style={s.chipsContainer}>
            {SERVICES_CATALOG.music.map((svc) => {
              const active = serviceSet.has(svc.slug);
              const full = !active && countInCategory("music") >= MAX_SERVICES_PER_CATEGORY;
              return (
                <Pressable
                  key={svc.slug}
                  style={[s.chip, active && s.chipActive, full && s.chipDisabled]}
                  onPress={() => toggleService(svc.slug)}
                  disabled={full}
                >
                  <Text style={s.chipEmoji}>{svc.emoji}</Text>
                  <Text style={[s.chipLabel, active && s.chipLabelActive, full && s.chipLabelDisabled]}>
                    {svc.label}
                  </Text>
                </Pressable>
              );
            })}
          </View>
        </ScrollView>
      )}

      {/* Footer */}
      <View style={s.footer}>
        <Pressable style={s.footerBack} onPress={handleBack}>
          <Ionicons name="arrow-back" size={18} color={colors.textSecondary} />
          <Text style={s.footerBackText}>{t("common.back")}</Text>
        </Pressable>
        <Pressable style={s.footerNext} onPress={step === 1 ? handleVibeNext : handleFinish}>
          <Text style={s.footerNextText}>
            {step === 1 ? t("training.next") : t("training.finish")}
          </Text>
          <Ionicons name={step === 1 ? "arrow-forward" : "checkmark"} size={18} color={colors.white} />
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
      minWidth: 50,
    },
    stepDots: {
      flexDirection: "row",
      gap: 8,
    },
    dot: {
      width: 8,
      height: 8,
      borderRadius: 4,
      backgroundColor: colors.border,
    },
    dotActive: {
      backgroundColor: colors.primary,
    },
    skipText: {
      fontSize: 14,
      color: colors.textSecondary,
      textAlign: "right",
    },
    scrollContent: {
      paddingHorizontal: 24,
      paddingBottom: 16,
    },
    mascotContainer: {
      alignItems: "center",
      marginBottom: 12,
    },
    mascot: {
      width: 90,
      height: 90,
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
    sectionHeader: {
      flexDirection: "row",
      justifyContent: "space-between",
      alignItems: "center",
      marginBottom: 12,
    },
    sectionTitle: {
      fontSize: 16,
      fontWeight: "600",
      color: colors.text,
    },
    optionalBadge: {
      fontSize: 13,
      fontWeight: "400",
      color: colors.textSecondary,
    },
    sectionCount: {
      fontSize: 13,
      color: colors.textSecondary,
    },
    chipsContainer: {
      flexDirection: "row",
      flexWrap: "wrap",
      gap: 8,
      marginBottom: 24,
    },
    chip: {
      flexDirection: "row",
      alignItems: "center",
      gap: 6,
      paddingHorizontal: 14,
      paddingVertical: 10,
      borderRadius: 20,
      borderWidth: 1,
      borderColor: colors.border,
      backgroundColor: colors.surface,
    },
    chipActive: {
      backgroundColor: colors.primary,
      borderColor: colors.primary,
    },
    chipSkipped: {
      backgroundColor: "#EF444430",
      borderColor: "#EF4444",
    },
    chipDisabled: {
      opacity: 0.4,
    },
    chipEmoji: {
      fontSize: 16,
    },
    chipLabel: {
      fontSize: 14,
      color: colors.text,
    },
    chipLabelActive: {
      color: colors.white,
      fontWeight: "600",
    },
    chipLabelDisabled: {
      color: colors.textSecondary,
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
      flexDirection: "row",
      alignItems: "center",
      gap: 6,
      backgroundColor: colors.primary,
      paddingVertical: 12,
      paddingHorizontal: 24,
      borderRadius: 12,
    },
    footerNextText: {
      fontSize: 16,
      fontWeight: "600",
      color: colors.white,
    },
  });
