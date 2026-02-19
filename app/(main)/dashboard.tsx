import { useCallback, useMemo, useState } from "react";
import { View, Text, ScrollView, Pressable, FlatList, Linking, StyleSheet } from "react-native";
import { useRouter } from "expo-router";
import { useFocusEffect } from "@react-navigation/native";
import { useTranslation } from "react-i18next";
import { useAuth } from "@/hooks/useAuth";
import { useTheme } from "@/contexts/ThemeContext";
import { useGrimoire } from "@/hooks/useGrimoire";
import { Image } from "expo-image";
import { MaterialCommunityIcons, Ionicons } from "@expo/vector-icons";
import { CommunityDetailModal } from "@/components/CommunityDetailModal";
import { TAG_CATALOG } from "@/constants/tags";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { getWelcomeMessage, getHelloHeader, getTimePeriod } from "@/services/welcome";
import { fetchRecentSessions, fetchSessionsThisWeek } from "@/services/history";
import { MiniPieChart } from "@/components/MiniPieChart";
import { MiniBarChart } from "@/components/MiniBarChart";
import { FeedbackFooter } from "@/components/FeedbackFooter";
import { fetchUserStats } from "@/services/stats";
import { getCommunitySuggestions } from "@/services/community";
import { getCurrentLanguage } from "@/i18n";
import type { SessionHistory, ActivitySample, UserStats } from "@/types";
import type { ThemeColors } from "@/constants";

// Images Mogogo aléatoires pour le dashboard (Metro requiert des require statiques)
const MOGOGO_DASHBOARD_IMAGES = [
  require("../../assets/images/destiny-parchment/mogogo-calm_escape.webp"),
  require("../../assets/images/destiny-parchment/mogogo-culture_knowledge.webp"),
  require("../../assets/images/destiny-parchment/mogogo-food_drink.webp"),
  require("../../assets/images/destiny-parchment/mogogo-move_sport.webp"),
  require("../../assets/images/destiny-parchment/mogogo-music_crea.webp"),
  require("../../assets/images/destiny-parchment/mogogo-nature_adventure.webp"),
  require("../../assets/images/destiny-parchment/mogogo-social_fun.webp"),
  require("../../assets/images/destiny-parchment/mogogo-story_screen.webp"),
];

export default function DashboardScreen() {
  const { t } = useTranslation();
  const { user } = useAuth();
  const { colors, isDark } = useTheme();
  const { preferences } = useGrimoire();
  const router = useRouter();
  const s = getStyles(colors, isDark);

  // Image aléatoire de Mogogo pour le header
  const randomMogogoImage = useMemo(
    () => MOGOGO_DASHBOARD_IMAGES[Math.floor(Math.random() * MOGOGO_DASHBOARD_IMAGES.length)],
    [],
  );

  const [recentSessions, setRecentSessions] = useState<SessionHistory[]>([]);
  const [stats, setStats] = useState<UserStats | null>(null);
  const [communitySuggestions, setCommunitySuggestions] = useState<ActivitySample[]>([]);
  const [selectedSample, setSelectedSample] = useState<ActivitySample | null>(null);
  const [modalVisible, setModalVisible] = useState(false);
  const [loaded, setLoaded] = useState(false);
  const [energy, setEnergy] = useState<"tired" | "fit" | "energetic" | null>(null);
  const [weeklySessions, setWeeklySessions] = useState<SessionHistory[]>([]);

  // Prenom de l'utilisateur
  const firstName = user?.user_metadata?.full_name?.split(" ")[0] ?? t("common.defaultName", { defaultValue: "ami" });

  // Header de salutation aleatoire selon l'heure
  const helloHeader = useMemo(() => getHelloHeader(t), [t]);

  // Greeting aleatoire selon l'heure
  const greeting = useMemo(() => {
    return getWelcomeMessage(t, firstName);
  }, [t, firstName]);

  // Top tag slugs du grimoire
  const topTagSlugs = useMemo(
    () =>
      preferences
        .sort((a, b) => b.score - a.score)
        .slice(0, 5)
        .map((p) => p.tag_slug),
    [preferences],
  );

  // Période horaire courante
  const timePeriod = useMemo(() => getTimePeriod(), []);

  // Breakdown environnements de la semaine
  const envBreakdown = useMemo(() => {
    const envColors: Record<string, string> = {
      env_home: "#8B5CF6",
      env_shelter: "#3B82F6",
      env_open_air: "#10B981",
    };
    const counts: Record<string, number> = {};
    for (const s of weeklySessions) {
      const env = s.context_snapshot?.environment;
      if (env) counts[env] = (counts[env] ?? 0) + 1;
    }
    return Object.entries(counts).map(([key, value]) => ({
      label: t(`dashboard.communityEnv.${key}`, { defaultValue: key }),
      value,
      color: envColors[key] ?? "#9CA3AF",
    }));
  }, [weeklySessions, t]);

  // Breakdown tags/catégories de la semaine
  const tagBreakdown = useMemo(() => {
    const tagColors: Record<string, string> = {
      story_screen: "#8B5CF6",
      calm_escape: "#3B82F6",
      music_crea: "#EC4899",
      move_sport: "#EF4444",
      nature_adventure: "#10B981",
      food_drink: "#F59E0B",
      culture_knowledge: "#6366F1",
      social_fun: "#14B8A6",
    };
    const counts: Record<string, number> = {};
    for (const s of weeklySessions) {
      for (const tag of s.activity_tags ?? []) {
        counts[tag] = (counts[tag] ?? 0) + 1;
      }
    }
    return Object.entries(counts)
      .map(([key, value]) => ({
        label: t(TAG_CATALOG[key]?.labelKey ?? `grimoire.tags.${key}`, { defaultValue: key }),
        value,
        color: tagColors[key] ?? "#9CA3AF",
        emoji: TAG_CATALOG[key]?.emoji ?? "🔖",
      }))
      .sort((a, b) => b.value - a.value);
  }, [weeklySessions, t]);

  // Recharger les données à chaque focus (retour après validation d'activité, etc.)
  useFocusEffect(
    useCallback(() => {
      let cancelled = false;
      (async () => {
        try {
          // Restaurer l'humeur si elle est valide pour la période courante
          const moodRaw = await AsyncStorage.getItem("mogogo_mood");
          if (moodRaw && !cancelled) {
            try {
              const parsed = JSON.parse(moodRaw);
              if (parsed.period === getTimePeriod()) {
                setEnergy(parsed.energy);
              } else {
                setEnergy(null);
              }
            } catch {
              setEnergy(null);
            }
          }

          const [recent, userStats, community, weekly] = await Promise.all([
            fetchRecentSessions(3),
            fetchUserStats(),
            getCommunitySuggestions(topTagSlugs, getCurrentLanguage()).catch(() => [] as ActivitySample[]),
            fetchSessionsThisWeek(),
          ]);
          if (!cancelled) {
            setRecentSessions(recent);
            setStats(userStats);
            setCommunitySuggestions(community);
            setWeeklySessions(weekly);
            setLoaded(true);
          }
        } catch {
          if (!cancelled) setLoaded(true);
        }
      })();
      return () => { cancelled = true; };
    }, [topTagSlugs]),
  );

  const toggleEnergy = (value: "tired" | "fit" | "energetic") => {
    const newValue = energy === value ? null : value;
    setEnergy(newValue);
    if (newValue) {
      AsyncStorage.setItem("mogogo_mood", JSON.stringify({ energy: newValue, period: getTimePeriod() }));
    } else {
      AsyncStorage.removeItem("mogogo_mood");
    }
  };

  const handleStartAdventure = (theme: string) => {
    setModalVisible(false);
    setSelectedSample(null);
    router.navigate("/(main)/home");
  };

  const renderCommunityCard = ({ item }: { item: ActivitySample }) => {
    const tag = TAG_CATALOG[item.theme];
    const emoji = tag?.emoji ?? "🔖";
    const socialLabel = item.social_context
      ? t(`context.social.${item.social_context}`, { defaultValue: "" })
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
        {socialLabel ? (
          <Text style={s.communityEnv}>{socialLabel}</Text>
        ) : null}
      </Pressable>
    );
  };

  return (
    <ScrollView style={s.scroll} contentContainerStyle={s.content}>
      {/* Quick Start */}
      <View style={s.welcomeCard}>
        <Image source={randomMogogoImage} style={s.welcomeMogogo} contentFit="contain" />
        <Text style={s.welcomeHeader}>{helloHeader}</Text>
        <Text style={s.welcomeText}>{greeting}</Text>
        <Pressable
          style={s.ctaButton}
          onPress={() => router.navigate("/(main)/home")}
        >
          <MaterialCommunityIcons name="auto-fix" size={20} color={colors.white} />
          <Text style={s.ctaText}>{t("dashboard.searchActivity")}</Text>
        </Pressable>
      </View>

      {/* Section Humeur */}
      <View style={s.sectionCard}>
        <Text style={s.sectionTitle}>{t(`dashboard.mood.${timePeriod}`)}</Text>
        <View style={s.moodRow}>
          {([
            { key: "tired" as const, emoji: "\u{1F634}" },
            { key: "fit" as const, emoji: "\u{1F4AA}" },
            { key: "energetic" as const, emoji: "\u{1F525}" },
          ]).map((item) => (
            <Pressable
              key={item.key}
              style={[s.moodChip, energy === item.key && s.moodChipActive]}
              onPress={() => toggleEnergy(item.key)}
            >
              <Text style={s.moodEmoji}>{item.emoji}</Text>
              <Text style={[s.moodLabel, energy === item.key && s.moodLabelActive]}>
                {t(`dashboard.mood.${item.key}`)}
              </Text>
            </Pressable>
          ))}
        </View>
        {energy && (
          <Text style={s.moodAcknowledged}>{t("dashboard.mood.acknowledged")}</Text>
        )}
      </View>

      {/* Inspirations de la Communauté */}
      {communitySuggestions.length > 0 && (
        <View style={s.sectionCard}>
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

      {/* Statistiques — Votre Empreinte Magique */}
      {stats && (
        <View style={s.section}>
          <View style={s.statsCard}>
            <Text style={s.statsTitle}>{t("dashboard.statsTitle")}</Text>

            {/* Compteur hebdo */}
            <View style={s.statsRow}>
              <Text style={s.statsWeeklyCount}>{stats.weekly_count}</Text>
              <Text style={[s.statsLabel, { color: colors.textSecondary }]}>{t("dashboard.statsWeekly", { count: stats.weekly_count })}</Text>
            </View>

            {/* Top theme */}
            <View style={s.statsRow}>
              <Text style={[s.statsLabel, { color: colors.textSecondary }]}>{t("dashboard.statsTopTheme")}</Text>
              {stats.top_theme && TAG_CATALOG[stats.top_theme] ? (
                <Text style={[s.statsThemeValue, { color: colors.text }]}>
                  {TAG_CATALOG[stats.top_theme].emoji} {t(TAG_CATALOG[stats.top_theme].labelKey)}
                </Text>
              ) : (
                <Text style={[s.statsThemeNoValue, { color: colors.textSecondary }]}>
                  {t("dashboard.statsNoTheme")}
                </Text>
              )}
            </View>

            {/* Barre d'exploration */}
            <View style={s.statsProgressSection}>
              <View style={s.statsProgressHeader}>
                <Text style={[s.statsLabel, { color: colors.textSecondary }]}>{t("dashboard.statsExplorer")}</Text>
                <Text style={[s.statsLabel, { color: colors.textSecondary }]}>{stats.explorer_ratio}%</Text>
              </View>
              <View style={[s.statsProgressBar, { backgroundColor: colors.border }]}>
                <View style={[s.statsProgressFill, { width: `${stats.explorer_ratio}%`, backgroundColor: colors.primary }]} />
              </View>
            </View>

            {/* Total */}
            <Text style={[s.statsTotal, { color: colors.textSecondary }]}>
              {t("dashboard.statsTotal", { count: stats.total_sessions })}
            </Text>
          </View>
        </View>
      )}

      {/* Récemment */}
      <View style={s.section}>
        <View style={s.sectionHeader}>
          <Text style={s.sectionTitle}>{t("dashboard.recently")}</Text>
          {recentSessions.length > 0 && (
            <Pressable onPress={() => router.navigate("/(main)/grimoire?tab=souvenirs")}>
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
              <Text style={s.recentEmoji}>
                {TAG_CATALOG[session.activity_tags?.[0]]?.emoji ?? "🔖"}
              </Text>
              <Text style={[s.recentTitle, { color: colors.text }]} numberOfLines={1}>{session.activity_title}</Text>
              <Text style={[s.recentDate, { color: colors.textSecondary }]}>
                {new Date(session.created_at).toLocaleDateString()}
              </Text>
            </Pressable>
          ))
        )}
      </View>

      {/* Environnements cette semaine */}
      {envBreakdown.length > 0 && (
        <View style={s.sectionCard}>
          <Text style={s.sectionTitle}>{t("dashboard.envChartTitle")}</Text>
          <MiniPieChart data={envBreakdown} textColor={colors.text} />
        </View>
      )}

      {/* Catégories cette semaine */}
      {tagBreakdown.length > 0 && (
        <View style={s.sectionCard}>
          <Text style={s.sectionTitle}>{t("dashboard.tagChartTitle")}</Text>
          <MiniBarChart data={tagBreakdown} textColor={colors.text} secondaryColor={colors.textSecondary} />
        </View>
      )}

      {/* Mogogo — Réseaux sociaux */}
      <View style={s.sectionCard}>
        <Text style={s.sectionTitle}>{t("dashboard.socialTitle")}</Text>
        <Text style={[s.mogogoSlogan, { textAlign: "center" }]}>{t("login.subtitle")}</Text>
        <View style={s.socialRow}>
          <Pressable
            style={[s.socialButton, { backgroundColor: "#000" }]}
            onPress={() => Linking.openURL("https://x.com/appmogogo")}
          >
            <MaterialCommunityIcons name="twitter" size={22} color="#fff" />
          </Pressable>
          <Pressable
            style={[s.socialButton, { backgroundColor: "#E4405F" }]}
            onPress={() => Linking.openURL("https://www.instagram.com/mogogoapp/")}
          >
            <MaterialCommunityIcons name="instagram" size={22} color="#fff" />
          </Pressable>
          <Pressable
            style={[s.socialButton, { backgroundColor: "#1877F2" }]}
            onPress={() => Linking.openURL("https://www.facebook.com/mogogoapp/")}
          >
            <MaterialCommunityIcons name="facebook" size={22} color="#fff" />
          </Pressable>
          <Pressable
            style={[s.socialButton, { backgroundColor: "#000" }]}
            onPress={() => Linking.openURL("https://www.tiktok.com/@mogogoapp")}
          >
            <Ionicons name="logo-tiktok" size={22} color="#fff" />
          </Pressable>
        </View>
      </View>

      {/* Feedback */}
      <View style={s.sectionCard}>
        <Text style={s.sectionTitle}>{t("feedback.sectionTitle")}</Text>
        <Text style={s.feedbackDescription}>{t("feedback.modalTitle")}</Text>
        <FeedbackFooter />
      </View>

      {/* Copyright */}
      <View style={s.copyrightSection}>
        <Text style={s.copyrightText}>
          {t("dashboard.copyright", { year: new Date().getFullYear() })}
        </Text>
        <Pressable onPress={() => Linking.openURL("https://mogogo.app/terms.html")}>
          <Text style={s.termsLink}>{t("dashboard.terms")}</Text>
        </Pressable>
        <Pressable onPress={() => Linking.openURL("https://mogogo.app/privacy.html")}>
          <Text style={s.termsLink}>{t("dashboard.privacy")}</Text>
        </Pressable>
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

const getStyles = (colors: ThemeColors, isDark: boolean) =>
  StyleSheet.create({
    scroll: {
      flex: 1,
    },
    content: {
      padding: 20,
      paddingBottom: 40,
    },
    /* ─── Welcome Card ─── */
    welcomeCard: {
      backgroundColor: isDark ? "#2D2650" : "#EDE5FF",
      borderRadius: 16,
      borderWidth: 1,
      borderColor: isDark ? "rgba(139, 92, 246, 0.3)" : "rgba(108, 63, 197, 0.2)",
      padding: 20,
      marginBottom: 24,
    },
    welcomeHeader: {
      fontSize: 20,
      fontWeight: "700",
      color: colors.text,
      marginBottom: 6,
      paddingRight: 80,
    },
    welcomeText: {
      fontSize: 15,
      color: colors.textSecondary,
      fontStyle: "italic",
      lineHeight: 21,
      marginBottom: 16,
      paddingRight: 80,
    },
    welcomeMogogo: {
      position: "absolute" as const,
      top: 10,
      right: 10,
      width: 75,
      height: 75,
      opacity: 0.9,
    },
    ctaButton: {
      backgroundColor: colors.primary,
      borderRadius: 16,
      paddingVertical: 14,
      alignItems: "center",
      flexDirection: "row",
      justifyContent: "center",
      gap: 8,
    },
    ctaText: {
      color: colors.white,
      fontSize: 18,
      fontWeight: "700",
    },
    /* ─── Section Card ─── */
    sectionCard: {
      backgroundColor: colors.surface,
      borderRadius: 16,
      borderWidth: 1,
      borderColor: colors.border,
      padding: 16,
      marginBottom: 24,
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
    /* ─── Mood Section ─── */
    moodRow: {
      flexDirection: "row",
      justifyContent: "center",
      gap: 10,
    },
    moodChip: {
      flex: 1,
      alignItems: "center",
      paddingVertical: 12,
      borderRadius: 14,
      borderWidth: 1,
      borderColor: colors.border,
      backgroundColor: colors.surface,
      gap: 4,
    },
    moodChipActive: {
      backgroundColor: colors.primary,
      borderColor: colors.primary,
    },
    moodEmoji: {
      fontSize: 24,
    },
    moodLabel: {
      fontSize: 13,
      fontWeight: "600",
      color: colors.text,
    },
    moodLabelActive: {
      color: colors.white,
    },
    moodAcknowledged: {
      fontSize: 13,
      color: colors.textSecondary,
      fontStyle: "italic",
      textAlign: "center",
      marginTop: 10,
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
      borderRadius: 16,
      borderWidth: 1,
      borderColor: colors.border,
      padding: 18,
      gap: 14,
    },
    statsTitle: {
      fontSize: 16,
      fontWeight: "700",
      color: colors.text,
    },
    statsRow: {
      flexDirection: "row",
      alignItems: "baseline",
      gap: 8,
    },
    statsWeeklyCount: {
      fontSize: 32,
      fontWeight: "800",
      color: colors.primary,
    },
    statsLabel: {
      fontSize: 14,
      fontWeight: "500",
    },
    statsThemeValue: {
      fontSize: 15,
      fontWeight: "600",
    },
    statsThemeNoValue: {
      fontSize: 14,
      fontStyle: "italic",
    },
    statsProgressSection: {
      gap: 6,
    },
    statsProgressHeader: {
      flexDirection: "row",
      justifyContent: "space-between",
      alignItems: "center",
    },
    statsProgressBar: {
      height: 8,
      borderRadius: 6,
      overflow: "hidden",
    },
    statsProgressFill: {
      height: 8,
      borderRadius: 6,
    },
    statsTotal: {
      fontSize: 13,
      fontWeight: "500",
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
    recentEmoji: {
      fontSize: 20,
      marginRight: 10,
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
    /* ─── Feedback ─── */
    feedbackDescription: {
      fontSize: 14,
      color: colors.textSecondary,
      lineHeight: 20,
      marginBottom: 14,
    },
    /* ─── Mogogo Social ─── */
    mogogoSlogan: {
      fontSize: 15,
      fontStyle: "italic",
      color: colors.textSecondary,
      marginBottom: 14,
      textAlign: "center",
    },
    socialRow: {
      flexDirection: "row",
      gap: 14,
      alignSelf: "center",
    },
    socialButton: {
      width: 42,
      height: 42,
      borderRadius: 21,
      alignItems: "center",
      justifyContent: "center",
    },
    /* ─── Copyright ─── */
    copyrightSection: {
      alignItems: "center",
      paddingVertical: 16,
      gap: 6,
    },
    copyrightText: {
      fontSize: 11,
      color: colors.textSecondary,
    },
    termsLink: {
      fontSize: 11,
      color: colors.primary,
      textDecorationLine: "underline",
    },
  });
