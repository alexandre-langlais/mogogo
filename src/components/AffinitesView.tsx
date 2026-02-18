import { useState, useEffect } from "react";
import { View, Text, Pressable, ScrollView, StyleSheet, ActivityIndicator } from "react-native";
import { Slider } from "@react-native-assets/slider";
import { useTranslation } from "react-i18next";
import { useGrimoire } from "@/hooks/useGrimoire";
import { useSubscriptions } from "@/hooks/useSubscriptions";
import { ALL_TAG_SLUGS, getTagDisplay } from "@/constants/tags";
import { SERVICES_CATALOG, MAX_SERVICES_PER_CATEGORY } from "@/services/subscriptions";
import { MogogoMascot } from "@/components/MogogoMascot";
import { useTheme } from "@/contexts/ThemeContext";
import type { ThemeColors } from "@/constants";

export function AffinitesView() {
  const { t } = useTranslation();
  const { colors } = useTheme();
  const s = getStyles(colors);
  const { preferences, loading, addTag, removeTag, updateScore } = useGrimoire();
  const { services, toggle: toggleService, countInCategory } = useSubscriptions();

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

  const serviceSet = new Set(services);

  if (loading) {
    return (
      <View style={s.centered}>
        <ActivityIndicator size="large" color={colors.primary} />
      </View>
    );
  }

  return (
    <ScrollView
      contentContainerStyle={[s.container, { paddingBottom: 48 }]}
      style={{ backgroundColor: "transparent" }}
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
          <View style={s.tagsGrid}>
            {availableSlugs.map((slug) => {
              const display = getTagDisplay(slug);
              return (
                <Pressable
                  key={slug}
                  style={s.tagGridCell}
                  onPress={() => addTag(slug)}
                >
                  <Text style={s.tagGridEmoji}>{display.emoji}</Text>
                  <Text style={s.tagGridLabel}>{t(display.labelKey)}</Text>
                </Pressable>
              );
            })}
          </View>
        </>
      )}

      {/* Section Services — carte distincte */}
      <View style={s.servicesCard}>
        <Text style={s.servicesCardTitle}>{t("grimoire.servicesTitle")}</Text>
        <Text style={s.servicesSubtitle}>{t("grimoire.servicesSubtitle")}</Text>

        <Text style={s.categoryLabel}>
          {t("grimoire.servicesVideo")} ({countInCategory("video")}/{MAX_SERVICES_PER_CATEGORY})
        </Text>
        <View style={s.tagsRow}>
          {SERVICES_CATALOG.video.map((svc) => {
            const active = serviceSet.has(svc.slug);
            const videoFull = !active && countInCategory("video") >= MAX_SERVICES_PER_CATEGORY;
            return (
              <Pressable
                key={svc.slug}
                style={[s.serviceChip, active && s.serviceChipActive, videoFull && s.serviceChipDisabled]}
                onPress={() => toggleService(svc.slug)}
                disabled={videoFull}
              >
                <Text style={[s.serviceChipText, active && s.serviceChipTextActive, videoFull && s.serviceChipTextDisabled]}>
                  {svc.emoji} {svc.label}
                </Text>
              </Pressable>
            );
          })}
        </View>

        <Text style={s.categoryLabel}>
          {t("grimoire.servicesMusic")} ({countInCategory("music")}/{MAX_SERVICES_PER_CATEGORY})
        </Text>
        <View style={s.tagsRow}>
          {SERVICES_CATALOG.music.map((svc) => {
            const active = serviceSet.has(svc.slug);
            const musicFull = !active && countInCategory("music") >= MAX_SERVICES_PER_CATEGORY;
            return (
              <Pressable
                key={svc.slug}
                style={[s.serviceChip, active && s.serviceChipActive, musicFull && s.serviceChipDisabled]}
                onPress={() => toggleService(svc.slug)}
                disabled={musicFull}
              >
                <Text style={[s.serviceChipText, active && s.serviceChipTextActive, musicFull && s.serviceChipTextDisabled]}>
                  {svc.emoji} {svc.label}
                </Text>
              </Pressable>
            );
          })}
        </View>
      </View>
    </ScrollView>
  );
}

const getStyles = (colors: ThemeColors) =>
  StyleSheet.create({
    centered: {
      flex: 1,
      justifyContent: "center",
      alignItems: "center",
      backgroundColor: "transparent",
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
    gaugeList: {
      gap: 16,
    },
    gaugeItem: {
      backgroundColor: colors.surface,
      borderRadius: 14,
      borderWidth: 1,
      borderColor: colors.border,
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
    tagsRow: {
      flexDirection: "row",
      flexWrap: "wrap",
      gap: 8,
    },
    tagsGrid: {
      flexDirection: "row",
      flexWrap: "wrap",
      gap: 10,
    },
    tagGridCell: {
      width: "47%" as any,
      flexDirection: "row",
      alignItems: "center",
      gap: 8,
      paddingHorizontal: 14,
      paddingVertical: 12,
      borderRadius: 14,
      borderWidth: 1,
      borderColor: colors.border,
      backgroundColor: colors.surface,
    },
    tagGridEmoji: {
      fontSize: 20,
    },
    tagGridLabel: {
      fontSize: 14,
      color: colors.text,
      flexShrink: 1,
    },
    servicesCard: {
      marginTop: 28,
      backgroundColor: colors.surface,
      borderRadius: 16,
      borderWidth: 1,
      borderColor: colors.border,
      borderLeftWidth: 3,
      borderLeftColor: colors.primary,
      padding: 18,
      gap: 4,
    },
    servicesCardTitle: {
      fontSize: 17,
      fontWeight: "700",
      color: colors.text,
    },
    servicesSubtitle: {
      fontSize: 13,
      color: colors.textSecondary,
      marginBottom: 12,
    },
    categoryLabel: {
      fontSize: 15,
      fontWeight: "600",
      color: colors.text,
      marginTop: 12,
      marginBottom: 8,
    },
    serviceChip: {
      paddingHorizontal: 14,
      paddingVertical: 10,
      borderRadius: 20,
      borderWidth: 1,
      borderColor: colors.border,
      backgroundColor: colors.surface,
    },
    serviceChipActive: {
      borderColor: colors.primary,
      backgroundColor: colors.primary + "20",
    },
    serviceChipText: {
      fontSize: 14,
      color: colors.text,
    },
    serviceChipTextActive: {
      color: colors.primary,
      fontWeight: "600",
    },
    serviceChipDisabled: {
      opacity: 0.4,
    },
    serviceChipTextDisabled: {
      color: colors.textSecondary,
    },
  });
