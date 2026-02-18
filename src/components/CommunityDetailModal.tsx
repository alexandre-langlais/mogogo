import { Modal, View, Text, Pressable, StyleSheet, ScrollView } from "react-native";
import { useTranslation } from "react-i18next";
import { useTheme } from "@/contexts/ThemeContext";
import { TAG_CATALOG } from "@/constants/tags";
import type { ActivitySample } from "@/types";
import type { ThemeColors } from "@/constants";

interface CommunityDetailModalProps {
  visible: boolean;
  sample: ActivitySample | null;
  onClose: () => void;
  onStartAdventure: (theme: string) => void;
}

export function CommunityDetailModal({ visible, sample, onClose, onStartAdventure }: CommunityDetailModalProps) {
  const { t } = useTranslation();
  const { colors } = useTheme();
  const s = getStyles(colors);

  if (!sample) return null;

  const tag = TAG_CATALOG[sample.theme];
  const emoji = tag?.emoji ?? "🔖";

  const envLabel = sample.environment
    ? t(`dashboard.communityEnv.${sample.environment}`, { defaultValue: sample.environment })
    : null;

  const socialLabel = sample.social_context
    ? t(`context.social.${sample.social_context}`, { defaultValue: sample.social_context })
    : null;

  return (
    <Modal visible={visible} transparent animationType="fade" statusBarTranslucent>
      <View style={s.overlay}>
        <View style={s.card}>
          <ScrollView showsVerticalScrollIndicator={false}>
            <Text style={s.emoji}>{emoji}</Text>
            <Text style={s.title}>{sample.title}</Text>
            <Text style={s.description}>{sample.description}</Text>

            {(envLabel || socialLabel) && (
              <View style={s.badges}>
                {envLabel && (
                  <View style={s.badge}>
                    <Text style={s.badgeText}>{envLabel}</Text>
                  </View>
                )}
                {socialLabel && (
                  <View style={s.badge}>
                    <Text style={s.badgeText}>{socialLabel}</Text>
                  </View>
                )}
              </View>
            )}
          </ScrollView>

          <Pressable
            style={s.primaryButton}
            onPress={() => onStartAdventure(sample.theme)}
          >
            <Text style={s.primaryButtonText}>{t("dashboard.communityStart")}</Text>
          </Pressable>

          <Pressable style={s.closeButton} onPress={onClose}>
            <Text style={s.closeText}>{t("dashboard.communityClose")}</Text>
          </Pressable>
        </View>
      </View>
    </Modal>
  );
}

const getStyles = (colors: ThemeColors) =>
  StyleSheet.create({
    overlay: {
      flex: 1,
      backgroundColor: colors.background,
      justifyContent: "center",
      alignItems: "center",
      padding: 24,
    },
    card: {
      backgroundColor: colors.surface,
      borderRadius: 20,
      borderWidth: 1,
      borderColor: colors.border,
      padding: 24,
      width: "100%",
      maxWidth: 400,
      maxHeight: "80%",
      alignItems: "center",
    },
    emoji: {
      fontSize: 48,
      textAlign: "center",
      marginBottom: 12,
    },
    title: {
      fontSize: 20,
      fontWeight: "700",
      color: colors.text,
      textAlign: "center",
      marginBottom: 12,
    },
    description: {
      fontSize: 15,
      color: colors.textSecondary,
      textAlign: "center",
      lineHeight: 22,
      marginBottom: 16,
    },
    badges: {
      flexDirection: "row",
      flexWrap: "wrap",
      justifyContent: "center",
      gap: 8,
      marginBottom: 8,
    },
    badge: {
      backgroundColor: colors.background,
      borderRadius: 12,
      paddingHorizontal: 12,
      paddingVertical: 6,
      borderWidth: 1,
      borderColor: colors.border,
    },
    badgeText: {
      fontSize: 13,
      color: colors.textSecondary,
      fontWeight: "500",
    },
    primaryButton: {
      backgroundColor: colors.primary,
      borderRadius: 14,
      paddingVertical: 14,
      paddingHorizontal: 24,
      width: "100%",
      alignItems: "center",
      marginTop: 16,
    },
    primaryButtonText: {
      color: colors.white,
      fontSize: 16,
      fontWeight: "700",
    },
    closeButton: {
      marginTop: 12,
      padding: 10,
    },
    closeText: {
      fontSize: 14,
      color: colors.textSecondary,
    },
  });
