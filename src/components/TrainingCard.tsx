import { View, Text, StyleSheet } from "react-native";
import type { ViewStyle } from "react-native";
import { useTranslation } from "react-i18next";
import { useTheme } from "@/contexts/ThemeContext";
import { getTagDisplay } from "@/constants/tags";
import type { ThemeColors } from "@/constants";
import type { TrainingCardData } from "@/constants/trainingDeck";

interface TrainingCardProps {
  card: TrainingCardData;
  style?: ViewStyle;
}

export function TrainingCard({ card, style }: TrainingCardProps) {
  const { t } = useTranslation();
  const { colors } = useTheme();
  const s = getStyles(colors);

  return (
    <View style={[s.card, style]}>
      <Text style={s.emoji}>{card.emoji}</Text>
      <Text style={s.title}>{t(card.titleKey)}</Text>
      <Text style={s.description}>{t(card.descriptionKey)}</Text>
      <View style={s.tagsRow}>
        {card.tags.map((slug) => {
          const tag = getTagDisplay(slug);
          return (
            <View key={slug} style={s.chip}>
              <Text style={s.chipText}>
                {tag.emoji} {t(tag.labelKey)}
              </Text>
            </View>
          );
        })}
      </View>
    </View>
  );
}

const getStyles = (colors: ThemeColors) =>
  StyleSheet.create({
    card: {
      backgroundColor: colors.surface,
      borderRadius: 20,
      padding: 28,
      alignItems: "center",
      shadowColor: colors.black,
      shadowOffset: { width: 0, height: 4 },
      shadowOpacity: 0.15,
      shadowRadius: 12,
      elevation: 6,
    },
    emoji: {
      fontSize: 72,
      marginBottom: 16,
    },
    title: {
      fontSize: 22,
      fontWeight: "700",
      color: colors.text,
      textAlign: "center",
      marginBottom: 8,
    },
    description: {
      fontSize: 15,
      color: colors.textSecondary,
      textAlign: "center",
      lineHeight: 22,
      marginBottom: 20,
    },
    tagsRow: {
      flexDirection: "row",
      flexWrap: "wrap",
      justifyContent: "center",
      gap: 8,
    },
    chip: {
      backgroundColor: colors.primary,
      borderRadius: 12,
      paddingHorizontal: 10,
      paddingVertical: 4,
    },
    chipText: {
      fontSize: 13,
      fontWeight: "600",
      color: colors.white,
    },
  });
