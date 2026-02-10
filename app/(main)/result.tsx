import { useEffect, useState, useRef, useMemo } from "react";
import { View, Text, Pressable, StyleSheet, ActivityIndicator, ScrollView } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useRouter } from "expo-router";
import { useTranslation } from "react-i18next";
import ConfettiCannon from "react-native-confetti-cannon";
import ViewShot from "react-native-view-shot";
import { useFunnel } from "@/contexts/FunnelContext";
import { MogogoMascot } from "@/components/MogogoMascot";
import { DestinyParchment } from "@/components/DestinyParchment";
import { LoadingMogogo, getNextAnimation, choiceToAnimationCategory } from "@/components/LoadingMogogo";
import { DecisionBreadcrumb } from "@/components/DecisionBreadcrumb";
import { openAction } from "@/services/places";
import { saveSession } from "@/services/history";
import { useTheme } from "@/contexts/ThemeContext";
import { useGrimoire } from "@/hooks/useGrimoire";
import { useShareParchment } from "@/hooks/useShareParchment";
import { getMascotVariant } from "@/utils/mascotVariant";
import type { ThemeColors } from "@/constants";
import type { Action } from "@/types";

export default function ResultScreen() {
  const router = useRouter();
  const { t } = useTranslation();
  const { state, reroll, refine, jumpToStep, reset } = useFunnel();
  const { currentResponse, loading } = state;
  const { colors } = useTheme();
  const insets = useSafeAreaInsets();
  const s = getStyles(colors);
  const { boostTags } = useGrimoire();

  const [validated, setValidated] = useState(false);
  const [validationAnim, setValidationAnim] = useState<any>(null);
  const confettiRef = useRef<ConfettiCannon>(null);

  const recommendation = currentResponse?.recommandation_finale;
  const mascotVariant = getMascotVariant(recommendation?.tags);
  const { viewShotRef, share, sharing } = useShareParchment(recommendation?.titre ?? "");

  const hasRefined = state.history.some((e) => e.choice === "refine");
  const hasRerolled = state.history.some((e) => e.choice === "reroll");

  const breadcrumbSteps = useMemo(() =>
    state.history
      .map((entry, index) => ({
        index,
        label: entry.choiceLabel ?? (entry.choice === "A" || entry.choice === "B" ? entry.choice : ""),
      }))
      .filter(step => step.label !== ""),
    [state.history]
  );

  // Quand le LLM repond en_cours (apres refine), naviguer vers le funnel
  useEffect(() => {
    if (currentResponse?.statut === "en_cours") {
      router.replace("/(main)/funnel");
    }
  }, [currentResponse?.statut]);

  // Reset validated si on change de recommandation
  useEffect(() => {
    setValidated(false);
  }, [currentResponse]);

  if (loading) {
    return <LoadingMogogo category={choiceToAnimationCategory(state.lastChoice)} />;
  }

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

  const handleValidate = async () => {
    setValidated(true);
    setValidationAnim(getNextAnimation("validation"));
    confettiRef.current?.start();
    // Boost tags en background
    const tags = recommendation.tags ?? [];
    if (tags.length > 0) {
      boostTags(tags);
    }
    // Sauvegarder dans l'historique (silencieux)
    try {
      await saveSession({
        title: recommendation.titre,
        description: recommendation.explication,
        tags,
        context: state.context!,
        actions: effectiveActions,
        session_id: state.sessionId ?? undefined,
      });
    } catch {}
  };

  const handleRestart = () => {
    reset();
    router.replace("/(main)/context");
  };

  // Phase 1 : layout centre (View), Phase 2 : scrollable (parchemin + boutons)
  if (!validated) {
    return (
      <View style={[s.container, { paddingBottom: 24 + insets.bottom }]}>
        {breadcrumbSteps.length > 0 && (
          <View style={s.breadcrumbWrapper}>
            <DecisionBreadcrumb
              steps={breadcrumbSteps}
              onStepPress={jumpToStep}
              disabled={loading}
            />
          </View>
        )}

        <ConfettiCannon
          ref={confettiRef}
          count={80}
          origin={{ x: -10, y: 0 }}
          autoStart={false}
          fadeOut
        />

        <MogogoMascot
          message={currentResponse?.mogogo_message ?? t("result.defaultSuccess")}
          animationSource={undefined}
        />

        <View style={s.card}>
          <Text style={s.title}>{recommendation.titre}</Text>
          <Text style={s.explanation}>{recommendation.explication}</Text>
        </View>

        <Pressable style={s.primaryButton} onPress={handleValidate}>
          <Text style={s.primaryButtonText}>{t("grimoire.letsGo")}</Text>
        </Pressable>

        {!hasRefined && (
          <Pressable
            style={[s.ghostButton, loading && s.ghostButtonDisabled]}
            onPress={refine}
            disabled={loading}
          >
            {loading ? (
              <ActivityIndicator size="small" color={colors.primary} />
            ) : (
              <Text style={s.ghostButtonText}>{t("result.refine")}</Text>
            )}
          </Pressable>
        )}

        {!hasRerolled && (
          <Pressable
            style={[s.ghostButton, loading && s.ghostButtonDisabled]}
            onPress={reroll}
            disabled={loading}
          >
            {loading ? (
              <ActivityIndicator size="small" color={colors.primary} />
            ) : (
              <Text style={s.ghostButtonText}>{t("result.anotherSuggestion")}</Text>
            )}
          </Pressable>
        )}
      </View>
    );
  }

  // Phase 2 : apres validation — actions + partage + recommencer
  return (
    <View style={{ flex: 1, backgroundColor: colors.background }}>
      {/* ViewShot hors-ecran pour la capture de partage */}
      <View style={s.offScreen} pointerEvents="none">
        <ViewShot
          ref={viewShotRef}
          options={{ format: "jpg", quality: 0.9 }}
          style={{ width: 350, height: 350 }}
        >
          <DestinyParchment
            title={recommendation.titre}
            energy={state.context?.energy}
            budget={state.context?.budget}
            variant={mascotVariant}
          />
        </ViewShot>
      </View>

      {/* Confettis hors ScrollView pour overlay plein ecran */}
      <ConfettiCannon
        ref={confettiRef}
        count={80}
        origin={{ x: -10, y: 0 }}
        autoStart
        fadeOut
      />

      <ScrollView
        style={{ flex: 1 }}
        contentContainerStyle={[s.scrollContent, { paddingBottom: 24 + insets.bottom }]}
      >
        {breadcrumbSteps.length > 0 && (
          <DecisionBreadcrumb
            steps={breadcrumbSteps}
            onStepPress={jumpToStep}
            disabled={false}
          />
        )}

        <MogogoMascot
          message={t("grimoire.mogogoBoost")}
          animationSource={validationAnim}
        />

        {/* Carte resultat */}
        <View style={s.card}>
          <Text style={s.title}>{recommendation.titre}</Text>
          <Text style={s.explanation}>{recommendation.explication}</Text>
        </View>

        {/* Boutons d'action — style normal */}
        {effectiveActions.map((action, index) => (
          <Pressable
            key={index}
            style={s.actionButton}
            onPress={() => handleAction(action)}
          >
            <Text style={s.actionButtonText}>
              {getActionLabel(action)}
            </Text>
          </Pressable>
        ))}

        {/* Bouton Partager avec miniature du parchemin */}
        <Pressable
          style={[s.shareButton, sharing && s.shareButtonDisabled]}
          onPress={share}
          disabled={sharing}
        >
          <View style={s.thumbnailContainer}>
            <View style={s.thumbnailInner}>
              <DestinyParchment
                title={recommendation.titre}
                energy={state.context?.energy}
                budget={state.context?.budget}
                variant={mascotVariant}
              />
            </View>
          </View>
          {sharing ? (
            <ActivityIndicator size="small" color={colors.primary} />
          ) : (
            <Text style={s.shareButtonText}>{t("result.shareDestiny")}</Text>
          )}
        </Pressable>

        {/* Recommencer */}
        <Pressable style={s.secondaryButton} onPress={handleRestart}>
          <Text style={s.secondaryText}>{t("common.restart")}</Text>
        </Pressable>
      </ScrollView>
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
    breadcrumbWrapper: {
      position: "absolute",
      top: 12,
      left: 0,
      right: 0,
      paddingHorizontal: 24,
    },
    scrollContent: {
      alignItems: "center",
      padding: 24,
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
    offScreen: {
      position: "absolute",
      left: -10000,
      top: 0,
      width: 350,
      height: 350,
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
    shareButton: {
      flexDirection: "row",
      padding: 14,
      borderRadius: 12,
      borderWidth: 2,
      borderColor: colors.primary,
      width: "100%",
      alignItems: "center",
      justifyContent: "center",
      gap: 12,
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
    actionButton: {
      padding: 14,
      borderRadius: 12,
      borderWidth: 2,
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
    thumbnailContainer: {
      width: 48,
      height: 48,
      borderRadius: 8,
      overflow: "hidden",
    },
    thumbnailInner: {
      width: 300,
      height: 300,
      transformOrigin: "top left",
      transform: [{ scale: 48 / 300 }],
    },
    ghostButton: {
      padding: 12,
      borderRadius: 12,
      width: "100%",
      alignItems: "center",
      marginTop: 4,
    },
    ghostButtonDisabled: {
      opacity: 0.5,
    },
    ghostButtonText: {
      fontSize: 15,
      color: colors.textSecondary,
      fontWeight: "500",
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
