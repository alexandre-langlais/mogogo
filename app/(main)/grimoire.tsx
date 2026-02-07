import { View, Text, Pressable, StyleSheet, ScrollView, ActivityIndicator } from "react-native";
import { useTranslation } from "react-i18next";
import { useGrimoire } from "@/hooks/useGrimoire";
import { ALL_TAG_SLUGS, getTagDisplay } from "@/constants/tags";
import { MogogoMascot } from "@/components/MogogoMascot";
import { useTheme } from "@/contexts/ThemeContext";
import type { ThemeColors } from "@/constants";

export default function GrimoireScreen() {
  const { t } = useTranslation();
  const { colors } = useTheme();
  const s = getStyles(colors);
  const { preferences, loading, addTag, removeTag } = useGrimoire();

  const activeSlugs = new Set(preferences.map((p) => p.tag_slug));
  const availableSlugs = ALL_TAG_SLUGS.filter((slug) => !activeSlugs.has(slug));

  if (loading) {
    return (
      <View style={s.centered}>
        <ActivityIndicator size="large" color={colors.primary} />
      </View>
    );
  }

  return (
    <ScrollView
      contentContainerStyle={s.container}
      style={{ backgroundColor: colors.background }}
    >
      <MogogoMascot message={t("grimoire.mogogoWelcome")} />

      <Text style={s.sectionTitle}>{t("grimoire.activeTags")}</Text>
      {preferences.length === 0 ? (
        <Text style={s.emptyText}>{t("grimoire.emptyState")}</Text>
      ) : (
        <View style={s.tagsRow}>
          {preferences.map((pref) => {
            const display = getTagDisplay(pref.tag_slug);
            return (
              <Pressable
                key={pref.tag_slug}
                style={s.activeChip}
                onPress={() => removeTag(pref.tag_slug)}
              >
                <Text style={s.activeChipText}>
                  {display.emoji} {t(display.labelKey)}
                </Text>
                <Text style={s.scoreText}>{pref.score}</Text>
                <Text style={s.removeIcon}>✕</Text>
              </Pressable>
            );
          })}
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
      paddingBottom: 48,
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
    tagsRow: {
      flexDirection: "row",
      flexWrap: "wrap",
      gap: 8,
    },
    activeChip: {
      flexDirection: "row",
      alignItems: "center",
      paddingHorizontal: 14,
      paddingVertical: 10,
      borderRadius: 20,
      backgroundColor: colors.primary,
      gap: 6,
    },
    activeChipText: {
      fontSize: 14,
      color: colors.white,
      fontWeight: "500",
    },
    scoreText: {
      fontSize: 12,
      color: colors.white,
      opacity: 0.8,
    },
    removeIcon: {
      fontSize: 12,
      color: colors.white,
      opacity: 0.7,
      marginLeft: 2,
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
