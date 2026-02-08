import { useEffect, useState } from "react";
import { View, Text, Pressable, StyleSheet, ScrollView, ActivityIndicator, Alert } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useLocalSearchParams, useRouter } from "expo-router";
import { useTranslation } from "react-i18next";
import { fetchSessionById, deleteSession } from "@/services/history";
import { openAction } from "@/services/places";
import { getTagDisplay } from "@/constants/tags";
import { MogogoMascot } from "@/components/MogogoMascot";
import { useTheme } from "@/contexts/ThemeContext";
import type { ThemeColors } from "@/constants";
import type { SessionHistory, Action } from "@/types";

function formatFullDate(iso: string, locale: string): string {
  return new Intl.DateTimeFormat(locale, {
    weekday: "long",
    day: "numeric",
    month: "long",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  }).format(new Date(iso));
}

export default function HistoryDetailScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const { t, i18n } = useTranslation();
  const { colors } = useTheme();
  const insets = useSafeAreaInsets();
  const s = getStyles(colors);

  const [session, setSession] = useState<SessionHistory | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!id) return;
    setLoading(true);
    fetchSessionById(id)
      .then(setSession)
      .finally(() => setLoading(false));
  }, [id]);

  const handleAction = (action: Action) => {
    const location = session?.context_snapshot?.location ?? undefined;
    if (action.type === "maps") {
      openAction(action, location);
    } else {
      openAction(action);
    }
  };

  const handleDelete = () => {
    Alert.alert(
      t("history.deleteConfirmTitle"),
      t("history.deleteConfirmMessage"),
      [
        { text: t("history.cancel"), style: "cancel" },
        {
          text: t("history.deleteConfirmButton"),
          style: "destructive",
          onPress: async () => {
            if (!id) return;
            await deleteSession(id);
            router.back();
          },
        },
      ],
    );
  };

  if (loading) {
    return (
      <View style={s.centered}>
        <ActivityIndicator size="large" color={colors.primary} />
      </View>
    );
  }

  if (!session) {
    return (
      <View style={s.centered}>
        <MogogoMascot message={t("history.notFound")} />
      </View>
    );
  }

  const actions = session.action_links ?? [];
  const tags = session.activity_tags ?? [];

  return (
    <ScrollView
      contentContainerStyle={[s.container, { paddingBottom: 48 + insets.bottom }]}
      style={{ backgroundColor: colors.background }}
    >
      <Text style={s.date}>{formatFullDate(session.created_at, i18n.language)}</Text>

      <View style={s.card}>
        <Text style={s.title}>{session.activity_title}</Text>
        <Text style={s.description}>{session.activity_description}</Text>
      </View>

      {tags.length > 0 && (
        <>
          <Text style={s.sectionTitle}>{t("history.tags")}</Text>
          <View style={s.tagsRow}>
            {tags.map((slug) => {
              const display = getTagDisplay(slug);
              return (
                <View key={slug} style={s.tagChip}>
                  <Text style={s.tagChipText}>{display.emoji} {t(display.labelKey)}</Text>
                </View>
              );
            })}
          </View>
        </>
      )}

      {actions.length > 0 && (
        <>
          <Text style={s.sectionTitle}>{t("history.actions")}</Text>
          {actions.map((action, index) => (
            <Pressable
              key={index}
              style={index === 0 ? s.primaryButton : s.actionButton}
              onPress={() => handleAction(action)}
            >
              <Text style={index === 0 ? s.primaryButtonText : s.actionButtonText}>
                {action.label || t(`result.actions.${action.type}`) || t("common.open")}
              </Text>
            </Pressable>
          ))}
        </>
      )}

      <Pressable style={s.deleteButton} onPress={handleDelete}>
        <Text style={s.deleteButtonText}>{t("history.delete")}</Text>
      </Pressable>
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
      padding: 24,
    },
    container: {
      padding: 24,
    },
    date: {
      fontSize: 14,
      color: colors.textSecondary,
      marginBottom: 16,
      textAlign: "center",
    },
    card: {
      backgroundColor: colors.surface,
      padding: 24,
      borderRadius: 16,
      marginBottom: 24,
    },
    title: {
      fontSize: 24,
      fontWeight: "bold",
      marginBottom: 12,
      color: colors.text,
    },
    description: {
      fontSize: 16,
      color: colors.text,
      lineHeight: 24,
    },
    sectionTitle: {
      fontSize: 16,
      fontWeight: "600",
      marginBottom: 10,
      color: colors.text,
    },
    tagsRow: {
      flexDirection: "row",
      flexWrap: "wrap",
      gap: 8,
      marginBottom: 24,
    },
    tagChip: {
      paddingHorizontal: 14,
      paddingVertical: 8,
      borderRadius: 20,
      backgroundColor: colors.surface,
      borderWidth: 1,
      borderColor: colors.border,
    },
    tagChipText: {
      fontSize: 14,
      color: colors.text,
    },
    primaryButton: {
      backgroundColor: colors.primary,
      padding: 16,
      borderRadius: 12,
      alignItems: "center",
      marginBottom: 10,
    },
    primaryButtonText: {
      color: colors.white,
      fontSize: 18,
      fontWeight: "600",
    },
    actionButton: {
      backgroundColor: colors.surface,
      padding: 14,
      borderRadius: 12,
      borderWidth: 1,
      borderColor: colors.primary,
      alignItems: "center",
      marginBottom: 10,
    },
    actionButtonText: {
      color: colors.primary,
      fontSize: 16,
      fontWeight: "600",
    },
    deleteButton: {
      padding: 14,
      borderRadius: 12,
      borderWidth: 1,
      borderColor: "#e74c3c",
      alignItems: "center",
      marginTop: 24,
    },
    deleteButtonText: {
      fontSize: 16,
      color: "#e74c3c",
      fontWeight: "500",
    },
  });
