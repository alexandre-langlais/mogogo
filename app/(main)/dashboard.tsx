import { useCallback, useMemo, useState } from "react";
import { View, Text, ScrollView, Pressable, FlatList, StyleSheet } from "react-native";
import { useRouter } from "expo-router";
import { useFocusEffect } from "@react-navigation/native";
import { useTranslation } from "react-i18next";
import { useAuth } from "@/hooks/useAuth";
import { useTheme } from "@/contexts/ThemeContext";
import { useGrimoire } from "@/hooks/useGrimoire";
import { MogogoMascot } from "@/components/MogogoMascot";
import { CommunityDetailModal } from "@/components/CommunityDetailModal";
import { TAG_CATALOG } from "@/constants/tags";
import { getWelcomeMessage } from "@/services/welcome";
import { fetchRecentSessions, countSessionsThisWeek } from "@/services/history";
import { getCommunitySuggestions } from "@/services/community";
import type { SessionHistory, ActivitySample } from "@/types";
import type { ThemeColors } from "@/constants";

export default function DashboardScreen() {
  const { t } = useTranslation();
  const { user } = useAuth();
  const { colors } = useTheme();
  const { preferences } = useGrimoire();
  const router = useRouter();
  const s = getStyles(colors);

  const [recentSessions, setRecentSessions] = useState<SessionHistory[]>([]);
  const [weekCount, setWeekCount] = useState(0);
  const [communitySuggestions, setCommunitySuggestions] = useState<ActivitySample[]>([]);
  const [selectedSample, setSelectedSample] = useState<ActivitySample | null>(null);
  const [modalVisible, setModalVisible] = useState(false);
  const [loaded, setLoaded] = useState(false);

  // Greeting aleatoire selon l'heure
  const greeting = useMemo(() => {
    const name = user?.user_metadata?.full_name?.split(" ")[0] ?? "ami";
    return getWelcomeMessage(t, name);
  }, [user, t]);

  // Top tag slugs du grimoire
  const topTagSlugs = useMemo(
    () =>
      preferences
        .sort((a, b) => b.score - a.score)
        .slice(0, 5)
        .map((p) => p.tag_slug),
    [preferences],
  );

  // Recharger les données à chaque focus (retour après validation d'activité, etc.)
  useFocusEffect(
    useCallback(() => {
      let cancelled = false;
      (async () => {
        try {
          const [recent, count, community] = await Promise.all([
            fetchRecentSessions(3),
            countSessionsThisWeek(),
            getCommunitySuggestions(topTagSlugs).catch(() => [] as ActivitySample[]),
          ]);
          if (!cancelled) {
            setRecentSessions(recent);
            setWeekCount(count);
            setCommunitySuggestions(community);
            setLoaded(true);
          }
        } catch {
          if (!cancelled) setLoaded(true);
        }
      })();
      return () => { cancelled = true; };
    }, [topTagSlugs]),
  );

  const handleStartAdventure = (theme: string) => {
    setModalVisible(false);
    setSelectedSample(null);
    router.navigate("/(main)/home");
  };

  const renderCommunityCard = ({ item }: { item: ActivitySample }) => {
    const tag = TAG_CATALOG[item.theme];
    const emoji = tag?.emoji ?? "🔖";
    const envLabel = item.environment
      ? t(`dashboard.communityEnv.${item.environment}`, { defaultValue: "" })
      : null;

    return (
      <Pressable
        style={s.communityCard}
        onPress={() => {
          setSelectedSample(item);
          setModalVisible(true);
        }}
      >
        <Text style={s.communityEmoji}>{emoji}</Text>
        <Text style={s.communityTitle} numberOfLines={2}>{item.title}</Text>
        {envLabel ? (
          <Text style={s.communityEnv}>{envLabel}</Text>
        ) : null}
      </Pressable>
    );
  };

  return (
    <ScrollView style={s.scroll} contentContainerStyle={s.content}>
      {/* Quick Start */}
      <MogogoMascot message={greeting} fullWidth />
      <Pressable
        style={s.ctaButton}
        onPress={() => router.navigate("/(main)/home")}
      >
        <Text style={s.ctaText}>{t("dashboard.searchActivity")}</Text>
      </Pressable>

      {/* Inspirations de la Communauté */}
      {communitySuggestions.length > 0 && (
        <View style={s.section}>
          <Text style={s.sectionTitle}>{t("dashboard.community")}</Text>
          <FlatList
            horizontal
            data={communitySuggestions}
            keyExtractor={(item) => item.id}
            renderItem={renderCommunityCard}
            showsHorizontalScrollIndicator={false}
            contentContainerStyle={s.communityList}
          />
        </View>
      )}

      {/* Statistiques */}
      <View style={s.section}>
        <Text style={s.sectionTitle}>{t("dashboard.stats")}</Text>
        <View style={s.statsCard}>
          <Text style={s.statsEmoji}>{"\uD83D\uDCCA"}</Text>
          <Text style={[s.statsText, { color: colors.text }]}>
            {weekCount > 0
              ? t("dashboard.sessionsThisWeek", { count: weekCount })
              : t("dashboard.noSessionsYet")}
          </Text>
        </View>
      </View>

      {/* Récemment */}
      <View style={s.section}>
        <View style={s.sectionHeader}>
          <Text style={s.sectionTitle}>{t("dashboard.recently")}</Text>
          {recentSessions.length > 0 && (
            <Pressable onPress={() => router.navigate("/(main)/history")}>
              <Text style={[s.seeAll, { color: colors.primary }]}>{t("dashboard.seeAll")}</Text>
            </Pressable>
          )}
        </View>
        {recentSessions.length === 0 && loaded ? (
          <Text style={[s.emptyText, { color: colors.textSecondary }]}>{t("dashboard.noRecent")}</Text>
        ) : (
          recentSessions.map((session) => (
            <Pressable
              key={session.id}
              style={s.recentItem}
              onPress={() => router.push(`/(main)/history/${session.id}`)}
            >
              <Text style={[s.recentTitle, { color: colors.text }]}>{session.activity_title}</Text>
              <Text style={[s.recentDate, { color: colors.textSecondary }]}>
                {new Date(session.created_at).toLocaleDateString()}
              </Text>
            </Pressable>
          ))
        )}
      </View>

      <CommunityDetailModal
        visible={modalVisible}
        sample={selectedSample}
        onClose={() => { setModalVisible(false); setSelectedSample(null); }}
        onStartAdventure={handleStartAdventure}
      />
    </ScrollView>
  );
}

const getStyles = (colors: ThemeColors) =>
  StyleSheet.create({
    scroll: {
      flex: 1,
    },
    content: {
      padding: 20,
      paddingBottom: 40,
    },
    ctaButton: {
      backgroundColor: colors.primary,
      borderRadius: 16,
      paddingVertical: 16,
      alignItems: "center",
      marginBottom: 28,
    },
    ctaText: {
      color: colors.white,
      fontSize: 18,
      fontWeight: "700",
    },
    section: {
      marginBottom: 24,
    },
    sectionHeader: {
      flexDirection: "row",
      justifyContent: "space-between",
      alignItems: "center",
      marginBottom: 12,
    },
    sectionTitle: {
      fontSize: 18,
      fontWeight: "700",
      color: colors.text,
      marginBottom: 12,
    },
    seeAll: {
      fontSize: 14,
      fontWeight: "600",
      marginBottom: 12,
    },
    communityList: {
      gap: 10,
    },
    communityCard: {
      width: 140,
      backgroundColor: colors.surface,
      borderRadius: 14,
      borderWidth: 1,
      borderColor: colors.border,
      padding: 14,
      alignItems: "center",
      gap: 6,
    },
    communityEmoji: {
      fontSize: 28,
    },
    communityTitle: {
      fontSize: 13,
      fontWeight: "600",
      color: colors.text,
      textAlign: "center",
    },
    communityEnv: {
      fontSize: 11,
      color: colors.textSecondary,
      fontWeight: "500",
    },
    statsCard: {
      backgroundColor: colors.surface,
      borderRadius: 14,
      borderWidth: 1,
      borderColor: colors.border,
      padding: 18,
      flexDirection: "row",
      alignItems: "center",
      gap: 12,
    },
    statsEmoji: {
      fontSize: 28,
    },
    statsText: {
      fontSize: 16,
      fontWeight: "600",
    },
    emptyText: {
      fontSize: 14,
      textAlign: "center",
      paddingVertical: 12,
    },
    recentItem: {
      backgroundColor: colors.surface,
      borderRadius: 12,
      borderWidth: 1,
      borderColor: colors.border,
      padding: 14,
      marginBottom: 8,
      flexDirection: "row",
      justifyContent: "space-between",
      alignItems: "center",
    },
    recentTitle: {
      fontSize: 15,
      fontWeight: "600",
      flex: 1,
    },
    recentDate: {
      fontSize: 12,
      marginLeft: 8,
    },
  });
