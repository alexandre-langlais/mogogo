import { useEffect, useState } from "react";
import { View, Text, Pressable, StyleSheet, ScrollView, ActivityIndicator, Alert, Linking } from "react-native";
import { useLocalSearchParams, useRouter, Stack } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import { useTranslation } from "react-i18next";
import ViewShot from "react-native-view-shot";
import { fetchSessionById, deleteSession } from "@/services/history";
import { openAction } from "@/services/places";
import { getTagDisplay } from "@/constants/tags";
import { MogogoMascot } from "@/components/MogogoMascot";
import { DestinyParchment } from "@/components/DestinyParchment";
import { useTheme } from "@/contexts/ThemeContext";
import { useShareParchment } from "@/hooks/useShareParchment";
import { getMascotVariant } from "@/utils/mascotVariant";
import type { ThemeColors } from "@/constants";
import { ActionIcon } from "@/utils/actionIcons";
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
  const s = getStyles(colors);

  const [session, setSession] = useState<SessionHistory | null>(null);
  const [loading, setLoading] = useState(true);
  const [hoursExpanded, setHoursExpanded] = useState(false);
  const { viewShotRef, share, sharing } = useShareParchment(session?.activity_title ?? "");
  const mascotVariant = getMascotVariant(session?.activity_tags);
  const meta = session?.activity_metadata;

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
    <View style={{ flex: 1, backgroundColor: colors.background }}>
      <Stack.Screen
        options={{
          headerRight: () => (
            <Pressable onPress={share} disabled={sharing} style={{ padding: 4 }}>
              <Ionicons name="arrow-redo-outline" size={22} color={colors.text} />
            </Pressable>
          ),
        }}
      />
      {/* ViewShot hors-écran pour capture parchemin */}
      <View style={s.offScreen} pointerEvents="none">
        <ViewShot
          ref={viewShotRef}
          options={{ format: "jpg", quality: 0.9 }}
          style={{ width: 350, height: 350 }}
        >
          <DestinyParchment
            title={session.activity_title}
            subtitle={meta?.address}
            editorialSummary={meta?.editorialSummary}
            social={session.context_snapshot?.social}
            tags={session.activity_tags}
            variant={mascotVariant}
          />
        </ViewShot>
      </View>

      <ScrollView
        contentContainerStyle={[s.container, { paddingBottom: 48 }]}
        style={{ flex: 1 }}
      >
      <Text style={s.date}>{formatFullDate(session.created_at, i18n.language)}</Text>

      <View style={s.card}>
        {meta?.themeEmoji && <Text style={s.outdoorThemeEmoji}>{meta.themeEmoji}</Text>}
        <Text style={s.title}>{session.activity_title}</Text>

        {/* Détails outdoor (rating, prix, horaires…) */}
        {meta ? (
          <>
            {meta.rating != null && (
              <View style={s.ratingRow}>
                <Text style={s.outdoorRating}>
                  {"★".repeat(Math.round(meta.rating))}{"☆".repeat(5 - Math.round(meta.rating))} {meta.rating.toFixed(1)}
                </Text>
                {meta.userRatingCount != null && (
                  <Text style={s.ratingCount}>({meta.userRatingCount})</Text>
                )}
              </View>
            )}

            {meta.priceRange?.startPrice && meta.priceRange?.endPrice ? (
              <Text style={s.priceText}>
                {t("result.priceRange", {
                  min: `${meta.priceRange.startPrice.units} ${meta.priceRange.startPrice.currencyCode}`,
                  max: `${meta.priceRange.endPrice.units} ${meta.priceRange.endPrice.currencyCode}`,
                })}
              </Text>
            ) : meta.priceLevel != null && (
              <Text style={s.priceText}>
                {meta.priceLevel === 0
                  ? t("result.priceFree")
                  : "$".repeat(meta.priceLevel)}
              </Text>
            )}

            {meta.address && <Text style={s.description}>{meta.address}</Text>}

            {meta.editorialSummary && (
              <Text style={s.editorialSummary}>{meta.editorialSummary}</Text>
            )}

            {meta.isOpen != null && (
              <Text style={[s.outdoorStatus, meta.isOpen ? s.outdoorOpen : s.outdoorClosed]}>
                {meta.isOpen ? t("result.placeOpen") : t("result.placeClosed")}
              </Text>
            )}

            {meta.openingHoursText && meta.openingHoursText.length > 0 && (
              <View style={s.hoursSection}>
                <Pressable
                  style={s.hoursToggle}
                  onPress={() => setHoursExpanded(!hoursExpanded)}
                >
                  <Ionicons name={hoursExpanded ? "chevron-up" : "chevron-down"} size={18} color={colors.primary} />
                  <Text style={s.hoursToggleText}>{t("result.openingHours")}</Text>
                </Pressable>
                {hoursExpanded && (
                  <View style={s.hoursList}>
                    {meta.openingHoursText.map((line, i) => (
                      <Text key={i} style={s.hoursLine}>{line}</Text>
                    ))}
                  </View>
                )}
              </View>
            )}
          </>
        ) : (
          <Text style={s.description}>{session.activity_description}</Text>
        )}
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
              <ActionIcon type={action.type} color={index === 0 ? colors.white : colors.primary} />
              <Text style={index === 0 ? s.primaryButtonText : s.actionButtonText}>
                {action.label || t(`result.actions.${action.type}`) || t("common.open")}
              </Text>
            </Pressable>
          ))}
        </>
      )}

      {/* Bouton téléphone (outdoor) */}
      {meta?.phoneNumber && (
        <Pressable
          style={s.actionButton}
          onPress={() => Linking.openURL(`tel:${meta.phoneNumber}`)}
        >
          <Ionicons name="call-outline" size={20} color={colors.primary} />
          <Text style={s.actionButtonText}>{t("result.call")}</Text>
        </Pressable>
      )}

      {/* Bouton partager le parchemin */}
      <Pressable
        style={[s.shareButton, sharing && s.shareButtonDisabled]}
        onPress={share}
        disabled={sharing}
      >
        {sharing ? (
          <ActivityIndicator size="small" color={colors.primary} />
        ) : (
          <Text style={s.shareButtonText}>{t("result.shareDestiny")}</Text>
        )}
      </Pressable>

      <Pressable style={s.deleteButton} onPress={handleDelete}>
        <Text style={s.deleteButtonText}>{t("history.delete")}</Text>
      </Pressable>
    </ScrollView>
    </View>
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
      flexDirection: "row",
      gap: 8,
      backgroundColor: colors.primary,
      padding: 16,
      borderRadius: 12,
      alignItems: "center",
      justifyContent: "center",
      marginBottom: 10,
    },
    primaryButtonText: {
      color: colors.white,
      fontSize: 18,
      fontWeight: "600",
    },
    actionButton: {
      flexDirection: "row",
      gap: 8,
      backgroundColor: colors.surface,
      padding: 14,
      borderRadius: 12,
      borderWidth: 1,
      borderColor: colors.primary,
      alignItems: "center",
      justifyContent: "center",
      marginBottom: 10,
    },
    actionButtonText: {
      color: colors.primary,
      fontSize: 16,
      fontWeight: "600",
    },
    offScreen: {
      position: "absolute",
      left: -10000,
      top: 0,
      width: 350,
      height: 350,
    },
    shareButton: {
      padding: 14,
      borderRadius: 12,
      borderWidth: 2,
      borderColor: colors.primary,
      alignItems: "center",
      marginTop: 16,
      marginBottom: 10,
    },
    shareButtonDisabled: {
      opacity: 0.5,
    },
    shareButtonText: {
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

    /* ─── Outdoor details ─── */
    outdoorThemeEmoji: {
      fontSize: 40,
      textAlign: "center" as const,
      marginBottom: 8,
    },
    ratingRow: {
      flexDirection: "row" as const,
      alignItems: "center" as const,
      gap: 6,
      marginBottom: 8,
    },
    outdoorRating: {
      fontSize: 16,
      color: colors.primary,
      fontWeight: "600" as const,
    },
    ratingCount: {
      fontSize: 14,
      color: colors.textSecondary,
    },
    priceText: {
      fontSize: 15,
      color: colors.textSecondary,
      fontWeight: "600" as const,
      marginBottom: 6,
    },
    editorialSummary: {
      fontSize: 15,
      color: colors.text,
      fontStyle: "italic" as const,
      lineHeight: 22,
      marginTop: 10,
    },
    outdoorStatus: {
      fontSize: 14,
      fontWeight: "600" as const,
      marginTop: 8,
    },
    outdoorOpen: {
      color: "#2ECC71",
    },
    outdoorClosed: {
      color: "#E85D4A",
    },
    hoursSection: {
      marginTop: 12,
    },
    hoursToggle: {
      flexDirection: "row" as const,
      alignItems: "center" as const,
      gap: 6,
    },
    hoursToggleText: {
      fontSize: 14,
      color: colors.primary,
      fontWeight: "600" as const,
    },
    hoursList: {
      marginTop: 6,
      paddingLeft: 4,
    },
    hoursLine: {
      fontSize: 13,
      color: colors.textSecondary,
      lineHeight: 20,
    },
  });
