import { useEffect } from "react";
import { View, Text, Pressable, StyleSheet, ActivityIndicator } from "react-native";
import { useRouter } from "expo-router";
import { useTranslation } from "react-i18next";
import { useFunnel } from "@/contexts/FunnelContext";
import { MogogoMascot } from "@/components/MogogoMascot";
import { openAction } from "@/services/places";
import { useTheme } from "@/contexts/ThemeContext";
import type { ThemeColors } from "@/constants";
import type { Action } from "@/types";

export default function ResultScreen() {
  const router = useRouter();
  const { t } = useTranslation();
  const { state, reroll, refine, reset } = useFunnel();
  const { currentResponse, loading } = state;
  const { colors } = useTheme();
  const s = getStyles(colors);

  const hasRefined = state.history.some((e) => e.choice === "refine");

  // Quand le LLM répond en_cours (après refine), naviguer vers le funnel
  useEffect(() => {
    if (currentResponse?.statut === "en_cours") {
      router.replace("/(main)/funnel");
    }
  }, [currentResponse?.statut]);

  const recommendation = currentResponse?.recommandation_finale;

  if (!recommendation) {
    return (
      <View style={s.container}>
        <MogogoMascot message={t("result.noRecommendation")} />
        <Pressable
          style={s.restartButton}
          onPress={() => {
            reset();
            router.replace("/(main)/context");
          }}
        >
          <Text style={s.restartText}>{t("common.restart")}</Text>
        </Pressable>
      </View>
    );
  }

  const actions = recommendation.actions ?? [];

  // Fallback : si pas d'actions mais google_maps_query existe
  const effectiveActions: Action[] = actions.length > 0
    ? actions
    : recommendation.google_maps_query
      ? [{ type: "maps" as const, label: t("result.actions.maps"), query: recommendation.google_maps_query }]
      : [];

  const getActionLabel = (action: Action) => {
    if (action.label) return action.label;
    const key = `result.actions.${action.type}` as const;
    return t(key) || t("common.open");
  };

  const handleAction = (action: Action) => {
    if (action.type === "maps") {
      openAction(action, state.context?.location ?? undefined);
    } else {
      openAction(action);
    }
  };

  const handleRestart = () => {
    reset();
    router.replace("/(main)/context");
  };

  return (
    <View style={s.container}>
      <MogogoMascot
        message={currentResponse?.mogogo_message ?? t("result.defaultSuccess")}
      />

      <View style={s.card}>
        <Text style={s.title}>{recommendation.titre}</Text>
        <Text style={s.explanation}>{recommendation.explication}</Text>
      </View>

      {effectiveActions.map((action, index) => (
        <Pressable
          key={index}
          style={index === 0 ? s.primaryButton : s.actionButton}
          onPress={() => handleAction(action)}
        >
          <Text style={index === 0 ? s.primaryButtonText : s.actionButtonText}>
            {getActionLabel(action)}
          </Text>
        </Pressable>
      ))}

      {!hasRefined && (
        <Pressable
          style={[s.refineButton, loading && s.rerollButtonDisabled]}
          onPress={refine}
          disabled={loading}
        >
          {loading ? (
            <ActivityIndicator size="small" color={colors.primary} />
          ) : (
            <Text style={s.refineText}>{t("result.refine")}</Text>
          )}
        </Pressable>
      )}

      <Pressable
        style={[s.rerollButton, loading && s.rerollButtonDisabled]}
        onPress={reroll}
        disabled={loading}
      >
        {loading ? (
          <ActivityIndicator size="small" color={colors.primary} />
        ) : (
          <Text style={s.rerollText}>{t("result.anotherSuggestion")}</Text>
        )}
      </Pressable>

      <Pressable style={s.secondaryButton} onPress={handleRestart}>
        <Text style={s.secondaryText}>{t("common.restart")}</Text>
      </Pressable>
    </View>
  );
}

const getStyles = (colors: ThemeColors) =>
  StyleSheet.create({
    container: {
      flex: 1,
      justifyContent: "center",
      alignItems: "center",
      padding: 24,
      backgroundColor: colors.background,
    },
    card: {
      backgroundColor: colors.surface,
      padding: 24,
      borderRadius: 16,
      width: "100%",
      marginBottom: 32,
    },
    title: {
      fontSize: 24,
      fontWeight: "bold",
      marginBottom: 12,
      color: colors.text,
    },
    explanation: {
      fontSize: 16,
      color: colors.text,
      lineHeight: 24,
    },
    primaryButton: {
      backgroundColor: colors.primary,
      padding: 16,
      borderRadius: 12,
      width: "100%",
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
      width: "100%",
      alignItems: "center",
      marginBottom: 10,
    },
    actionButtonText: {
      color: colors.primary,
      fontSize: 16,
      fontWeight: "600",
    },
    refineButton: {
      backgroundColor: colors.primary,
      padding: 14,
      borderRadius: 12,
      width: "100%",
      alignItems: "center",
      marginTop: 6,
    },
    refineText: {
      fontSize: 16,
      color: colors.white,
      fontWeight: "600",
    },
    rerollButton: {
      padding: 14,
      borderRadius: 12,
      borderWidth: 1,
      borderColor: colors.primary,
      width: "100%",
      alignItems: "center",
      marginTop: 6,
    },
    rerollButtonDisabled: {
      opacity: 0.5,
    },
    rerollText: {
      fontSize: 16,
      color: colors.primary,
      fontWeight: "600",
    },
    secondaryButton: {
      padding: 14,
      borderRadius: 12,
      borderWidth: 1,
      borderColor: colors.border,
      width: "100%",
      alignItems: "center",
      marginTop: 6,
    },
    secondaryText: {
      fontSize: 16,
      color: colors.textSecondary,
    },
    restartButton: {
      marginTop: 24,
      padding: 16,
      borderRadius: 12,
      backgroundColor: colors.primary,
      width: "100%",
      alignItems: "center",
    },
    restartText: {
      color: colors.white,
      fontSize: 18,
      fontWeight: "600",
    },
  });
