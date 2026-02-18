import { View, Text, Pressable, StyleSheet, FlatList, ActivityIndicator, RefreshControl } from "react-native";
import { useRouter } from "expo-router";
import { useTranslation } from "react-i18next";
import { useHistory } from "@/hooks/useHistory";
import { getTagDisplay } from "@/constants/tags";
import { MogogoMascot } from "@/components/MogogoMascot";
import { useTheme } from "@/contexts/ThemeContext";
import type { ThemeColors } from "@/constants";
import type { SessionHistory } from "@/types";

function formatDate(iso: string, locale: string): string {
  return new Intl.DateTimeFormat(locale, {
    day: "numeric",
    month: "short",
    year: "numeric",
  }).format(new Date(iso));
}

export default function HistoryListScreen() {
  const router = useRouter();
  const { t, i18n } = useTranslation();
  const { colors } = useTheme();
  const s = getStyles(colors);
  const { sessions, loading, hasMore, loadMore, refresh } = useHistory();

  const renderItem = ({ item }: { item: SessionHistory }) => {
    const mainTag = item.activity_tags[0];
    const tagDisplay = mainTag ? getTagDisplay(mainTag) : null;

    return (
      <Pressable
        style={s.card}
        onPress={() => router.push(`/(main)/history/${item.id}`)}
      >
        <View style={s.cardHeader}>
          {tagDisplay && <Text style={s.cardEmoji}>{tagDisplay.emoji}</Text>}
          <View style={s.cardHeaderText}>
            <Text style={s.cardTitle} numberOfLines={1}>{item.activity_title}</Text>
            <Text style={s.cardDate}>{formatDate(item.created_at, i18n.language)}</Text>
          </View>
        </View>
        <Text style={s.cardDescription} numberOfLines={2}>
          {item.activity_description}
        </Text>
      </Pressable>
    );
  };

  const renderFooter = () => {
    if (!hasMore || !loading) return null;
    return (
      <View style={s.footer}>
        <ActivityIndicator size="small" color={colors.primary} />
      </View>
    );
  };

  if (loading && sessions.length === 0) {
    return (
      <View style={s.centered}>
        <ActivityIndicator size="large" color={colors.primary} />
      </View>
    );
  }

  if (sessions.length === 0) {
    return (
      <View style={s.centered}>
        <MogogoMascot message={t("history.emptyState")} />
      </View>
    );
  }

  return (
    <FlatList
      data={sessions}
      keyExtractor={(item) => item.id}
      renderItem={renderItem}
      contentContainerStyle={[s.list, { paddingBottom: 24 }]}
      style={{ backgroundColor: "transparent" }}
      onEndReached={loadMore}
      onEndReachedThreshold={0.3}
      ListHeaderComponent={<MogogoMascot message={t("history.mogogoWelcome")} />}
      ListFooterComponent={renderFooter}
      refreshControl={
        <RefreshControl refreshing={false} onRefresh={refresh} tintColor={colors.primary} />
      }
    />
  );
}

const getStyles = (colors: ThemeColors) =>
  StyleSheet.create({
    centered: {
      flex: 1,
      justifyContent: "center",
      alignItems: "center",
      backgroundColor: "transparent",
      padding: 24,
    },
    list: {
      padding: 16,
      gap: 12,
    },
    card: {
      backgroundColor: colors.surface,
      borderRadius: 16,
      borderWidth: 1,
      borderColor: colors.border,
      padding: 16,
    },
    cardHeader: {
      flexDirection: "row",
      alignItems: "center",
      marginBottom: 8,
      gap: 10,
    },
    cardEmoji: {
      fontSize: 28,
    },
    cardHeaderText: {
      flex: 1,
    },
    cardTitle: {
      fontSize: 17,
      fontWeight: "600",
      color: colors.text,
    },
    cardDate: {
      fontSize: 13,
      color: colors.textSecondary,
      marginTop: 2,
    },
    cardDescription: {
      fontSize: 14,
      color: colors.textSecondary,
      lineHeight: 20,
    },
    footer: {
      paddingVertical: 16,
      alignItems: "center",
    },
  });
