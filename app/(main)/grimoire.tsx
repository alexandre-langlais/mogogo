import { useState, useEffect } from "react";
import { View, Text, Pressable, StyleSheet, ScrollView, ActivityIndicator } from "react-native";
import { Slider } from "@react-native-assets/slider";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useTranslation } from "react-i18next";
import { useGrimoire } from "@/hooks/useGrimoire";
import { ALL_TAG_SLUGS, getTagDisplay } from "@/constants/tags";
import { MogogoMascot } from "@/components/MogogoMascot";
import { useTheme } from "@/contexts/ThemeContext";
import type { ThemeColors } from "@/constants";

export default function GrimoireScreen() {
  const { t } = useTranslation();
  const { colors } = useTheme();
  const insets = useSafeAreaInsets();
  const s = getStyles(colors);
  const { preferences, loading, addTag, removeTag, updateScore } = useGrimoire();

  // Optimistic local scores for smooth slider UX
  const [localScores, setLocalScores] = useState<Record<string, number>>({});

  useEffect(() => {
    const scores: Record<string, number> = {};
    for (const pref of preferences) {
      scores[pref.tag_slug] = pref.score;
    }
    setLocalScores(scores);
  }, [preferences]);

  const activeSlugs = new Set(preferences.map((p) => p.tag_slug));
  const availableSlugs = ALL_TAG_SLUGS.filter((slug) => !activeSlugs.has(slug));

  const handleSliderChange = (slug: string, value: number) => {
    setLocalScores((prev) => ({ ...prev, [slug]: Math.round(value) }));
  };

  const handleSliderComplete = (slug: string, value: number) => {
    updateScore(slug, Math.round(value));
  };

  if (loading) {
    return (
      <View style={s.centered}>
        <ActivityIndicator size="large" color={colors.primary} />
      </View>
    );
  }

  return (
    <ScrollView
      contentContainerStyle={[s.container, { paddingBottom: 48 + insets.bottom }]}
      style={{ backgroundColor: colors.background }}
    >
      <MogogoMascot message={t("grimoire.mogogoWelcome")} />

      <Text style={s.sectionTitle}>{t("grimoire.topTags")}</Text>
      {preferences.length === 0 ? (
        <Text style={s.emptyText}>{t("grimoire.emptyState")}</Text>
      ) : (
        <View style={s.gaugeList}>
          {preferences.map((pref) => {
            const display = getTagDisplay(pref.tag_slug);
            const score = localScores[pref.tag_slug] ?? pref.score;
            return (
              <View key={pref.tag_slug} style={s.gaugeItem}>
                <View style={s.gaugeHeader}>
                  <Text style={s.gaugeLabel}>
                    {display.emoji} {t(display.labelKey)}
                  </Text>
                  <View style={s.gaugeRight}>
                    <Text style={s.gaugeScore}>{score}/100</Text>
                    <Pressable
                      onPress={() => removeTag(pref.tag_slug)}
                      hitSlop={8}
                    >
                      <Text style={s.removeIcon}>{"\u2715"}</Text>
                    </Pressable>
                  </View>
                </View>
                <Slider
                  value={score}
                  minimumValue={0}
                  maximumValue={100}
                  step={5}
                  minimumTrackTintColor={colors.primary}
                  maximumTrackTintColor={colors.border}
                  thumbTintColor={colors.white}
                  thumbStyle={s.thumb}
                  trackHeight={6}
                  onValueChange={(v) => handleSliderChange(pref.tag_slug, v)}
                  onSlidingComplete={(v) => handleSliderComplete(pref.tag_slug, v)}
                />
              </View>
            );
          })}
          <Text style={s.hintText}>{t("grimoire.adjustHint")}</Text>
        </View>
      )}

      {availableSlugs.length > 0 && (
        <>
          <Text style={s.sectionTitle}>{t("grimoire.availableTags")}</Text>
          <View style={s.tagsRow}>
            {availableSlugs.map((slug) => {
              const display = getTagDisplay(slug);
              return (
                <Pressable
                  key={slug}
                  style={s.availableChip}
                  onPress={() => addTag(slug)}
                >
                  <Text style={s.availableChipText}>
                    {display.emoji} {t(display.labelKey)}
                  </Text>
                </Pressable>
              );
            })}
          </View>
        </>
      )}
    </ScrollView>
  );
}

const getStyles = (colors: ThemeColors) =>
  StyleSheet.create({
    centered: {
      flex: 1,
      justifyContent: "center",
      alignItems: "center",
      backgroundColor: colors.background,
    },
    container: {
      padding: 24,
    },
    sectionTitle: {
      fontSize: 18,
      fontWeight: "600",
      marginTop: 24,
      marginBottom: 12,
      color: colors.text,
    },
    emptyText: {
      fontSize: 14,
      color: colors.textSecondary,
      fontStyle: "italic",
    },

    /* Gauge list */
    gaugeList: {
      gap: 16,
    },
    gaugeItem: {
      backgroundColor: colors.surface,
      borderRadius: 14,
      padding: 14,
    },
    gaugeHeader: {
      flexDirection: "row",
      justifyContent: "space-between",
      alignItems: "center",
      marginBottom: 8,
    },
    gaugeLabel: {
      fontSize: 16,
      fontWeight: "600",
      color: colors.text,
    },
    gaugeRight: {
      flexDirection: "row",
      alignItems: "center",
      gap: 10,
    },
    gaugeScore: {
      fontSize: 14,
      fontWeight: "600",
      color: colors.primary,
    },
    removeIcon: {
      fontSize: 14,
      color: colors.textSecondary,
      opacity: 0.6,
    },
    thumb: {
      width: 24,
      height: 24,
      borderRadius: 12,
      borderWidth: 3,
      borderColor: colors.primary,
      backgroundColor: colors.white,
    },
    hintText: {
      fontSize: 12,
      color: colors.textSecondary,
      fontStyle: "italic",
      textAlign: "center",
      marginTop: 4,
    },

    /* Available tags */
    tagsRow: {
      flexDirection: "row",
      flexWrap: "wrap",
      gap: 8,
    },
    availableChip: {
      paddingHorizontal: 14,
      paddingVertical: 10,
      borderRadius: 20,
      borderWidth: 1,
      borderColor: colors.border,
      backgroundColor: colors.surface,
    },
    availableChipText: {
      fontSize: 14,
      color: colors.text,
    },
  });
