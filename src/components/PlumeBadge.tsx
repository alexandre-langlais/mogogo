import { useEffect, useRef, useState } from "react";
import { Text, Animated, Pressable, Modal, View, StyleSheet } from "react-native";
import { useTranslation } from "react-i18next";
import { useTheme } from "@/contexts/ThemeContext";
import { getCurrentLanguage } from "@/i18n";
import type { ThemeColors } from "@/constants";

interface PlumeBadgeProps {
  plumes: number;
}

function getNextMidnight(): Date {
  const now = new Date();
  const next = new Date(now);
  next.setDate(next.getDate() + 1);
  next.setHours(0, 0, 0, 0);
  return next;
}

function formatNextRefill(): string {
  const next = getNextMidnight();
  const lang = getCurrentLanguage();
  const localeMap: Record<string, string> = { fr: "fr-FR", en: "en-US", es: "es-ES" };
  return next.toLocaleString(localeMap[lang] ?? "en-US", {
    weekday: "long",
    day: "numeric",
    month: "long",
    hour: "2-digit",
    minute: "2-digit",
  });
}

export function PlumeBadge({ plumes }: PlumeBadgeProps) {
  const { t } = useTranslation();
  const { colors } = useTheme();
  const s = getStyles(colors);
  const scale = useRef(new Animated.Value(1)).current;
  const prevPlumes = useRef(plumes);
  const [modalVisible, setModalVisible] = useState(false);

  useEffect(() => {
    if (prevPlumes.current !== plumes) {
      prevPlumes.current = plumes;
      Animated.sequence([
        Animated.timing(scale, {
          toValue: 1.3,
          duration: 150,
          useNativeDriver: true,
        }),
        Animated.timing(scale, {
          toValue: 1,
          duration: 150,
          useNativeDriver: true,
        }),
      ]).start();
    }
  }, [plumes, scale]);

  const isInfinite = !isFinite(plumes);
  const isEmpty = plumes === 0;

  return (
    <>
      <Pressable onPress={() => setModalVisible(true)} hitSlop={8}>
        <Animated.View style={[s.badge, isEmpty && s.badgeEmpty, { transform: [{ scale }] }]}>
          <Text style={s.emoji}>🪶</Text>
          <Text style={[s.count, isEmpty && s.countEmpty]}>
            {isInfinite ? "\u221E" : plumes}
          </Text>
        </Animated.View>
      </Pressable>

      <Modal
        visible={modalVisible}
        transparent
        animationType="fade"
        onRequestClose={() => setModalVisible(false)}
      >
        <Pressable style={s.overlay} onPress={() => setModalVisible(false)}>
          <View style={s.modal} onStartShouldSetResponder={() => true}>
            <Text style={s.modalTitle}>🪶 {t("plumes.infoTitle")}</Text>

            <Text style={s.modalBalance}>
              {isInfinite ? "\u221E" : plumes}
            </Text>

            <Text style={s.modalText}>{t("plumes.infoSessionCost")}</Text>
            <Text style={s.modalText}>{t("plumes.infoRefill")}</Text>

            {!isInfinite && (
              <View style={s.refillBox}>
                <Text style={s.refillLabel}>{t("plumes.infoNextRefill")}</Text>
                <Text style={s.refillDate}>{formatNextRefill()}</Text>
              </View>
            )}

            <Text style={s.comingSoon}>{t("plumes.infoComingSoon")}</Text>

            <Pressable style={s.closeButton} onPress={() => setModalVisible(false)}>
              <Text style={s.closeButtonText}>{t("plumes.infoClose")}</Text>
            </Pressable>
          </View>
        </Pressable>
      </Modal>
    </>
  );
}

const getStyles = (colors: ThemeColors) =>
  StyleSheet.create({
    badge: {
      flexDirection: "row",
      alignItems: "center",
      backgroundColor: colors.surface,
      borderRadius: 12,
      paddingHorizontal: 8,
      paddingVertical: 4,
      gap: 4,
    },
    badgeEmpty: {
      backgroundColor: "#FDEDED",
    },
    emoji: {
      fontSize: 14,
    },
    count: {
      fontSize: 14,
      fontWeight: "600",
      color: colors.text,
    },
    countEmpty: {
      color: "#D32F2F",
    },
    overlay: {
      flex: 1,
      backgroundColor: "rgba(0,0,0,0.5)",
      justifyContent: "center",
      alignItems: "center",
      padding: 32,
    },
    modal: {
      backgroundColor: colors.background,
      borderRadius: 20,
      padding: 24,
      width: "100%",
      maxWidth: 340,
      alignItems: "center",
    },
    modalTitle: {
      fontSize: 20,
      fontWeight: "700",
      color: colors.text,
      marginBottom: 8,
    },
    modalBalance: {
      fontSize: 40,
      fontWeight: "800",
      color: colors.primary,
      marginBottom: 16,
    },
    modalText: {
      fontSize: 15,
      color: colors.text,
      textAlign: "center",
      marginBottom: 8,
      lineHeight: 22,
    },
    refillBox: {
      backgroundColor: colors.surface,
      borderRadius: 12,
      padding: 12,
      width: "100%",
      alignItems: "center",
      marginTop: 8,
      marginBottom: 8,
    },
    refillLabel: {
      fontSize: 13,
      color: colors.textSecondary,
      marginBottom: 4,
    },
    refillDate: {
      fontSize: 15,
      fontWeight: "600",
      color: colors.primary,
    },
    comingSoon: {
      fontSize: 13,
      color: colors.textSecondary,
      textAlign: "center",
      fontStyle: "italic",
      marginTop: 8,
      marginBottom: 16,
    },
    closeButton: {
      backgroundColor: colors.primary,
      borderRadius: 12,
      paddingVertical: 12,
      paddingHorizontal: 32,
    },
    closeButtonText: {
      color: colors.white,
      fontSize: 16,
      fontWeight: "600",
    },
  });
