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
import { TAG_CATALOG, ALL_TAG_SLUGS } from "@/constants/tags";
import type { ThemeColors } from "@/constants";

export default function TrainingScreen() {
  const { t } = useTranslation();
  const router = useRouter();
  const { colors } = useTheme();
  const insets = useSafeAreaInsets();
  const { boostTags, penalizeTags } = useGrimoire();
  const s = getStyles(colors);

  const [liked, setLiked] = useState<Set<string>>(new Set());
  const [skipped, setSkipped] = useState<Set<string>>(new Set());

  const toggleLiked = (slug: string) => {
    setLiked((prev) => {
      const next = new Set(prev);
      if (next.has(slug)) {
        next.delete(slug);
      } else {
        next.add(slug);
        // Retirer des skipped si présent
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
        // Retirer des liked si présent
        setLiked((s) => { const n = new Set(s); n.delete(slug); return n; });
      }
      return next;
    });
  };

  const handleNext = async () => {
    // Appliquer les préférences au grimoire
    if (liked.size > 0) {
      await boostTags(Array.from(liked));
    }
    if (skipped.size > 0) {
      await penalizeTags(Array.from(skipped));
    }
    await AsyncStorage.setItem("mogogo_training_completed", "true");
    router.back();
  };

  const handleSkip = async () => {
    await AsyncStorage.setItem("mogogo_training_completed", "true");
    router.back();
  };

  return (
    <View style={[s.container, { paddingTop: insets.top, paddingBottom: insets.bottom }]}>
      {/* Header */}
      <View style={s.header}>
        <Pressable onPress={() => router.back()} style={s.headerButton}>
          <Ionicons name="arrow-back" size={22} color={colors.text} />
        </Pressable>
        <View style={s.stepDots}>
          <View style={s.dot} />
          <View style={[s.dot, s.dotActive]} />
        </View>
        <Pressable onPress={handleSkip} style={s.headerButton}>
          <Text style={s.skipText}>{t("training.skip")}</Text>
        </Pressable>
      </View>

      <ScrollView contentContainerStyle={s.scrollContent} style={{ flex: 1 }}>
        {/* Mascotte */}
        <View style={s.mascotContainer}>
          <Image
            source={require("../../assets/animations/startup/mogogo-accueil.webp")}
            style={s.mascot}
            contentFit="contain"
            autoplay={true}
          />
        </View>

        {/* Titre */}
        <Text style={s.title}>{t("training.vibeTitle")}</Text>
        <Text style={s.subtitle}>{t("training.vibeSubtitle")}</Text>

        {/* Section : Ce qui t'intéresse */}
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

        {/* Section : Plutôt éviter */}
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

      {/* Footer */}
      <View style={s.footer}>
        <Pressable style={s.footerBack} onPress={() => router.back()}>
          <Ionicons name="arrow-back" size={18} color={colors.textSecondary} />
          <Text style={s.footerBackText}>{t("common.back")}</Text>
        </Pressable>
        <Pressable style={s.footerNext} onPress={handleNext}>
          <Text style={s.footerNextText}>{t("training.next")}</Text>
          <Ionicons name="arrow-forward" size={18} color={colors.white} />
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
