import { useEffect, useState, useRef, useMemo } from "react";
import {
  View,
  Text,
  Pressable,
  StyleSheet,
  ActivityIndicator,
  ScrollView,
  LayoutAnimation,
  UIManager,
  Platform,
  Animated,
} from "react-native";
import { useRouter, Stack } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import { useTranslation } from "react-i18next";
import * as Haptics from "expo-haptics";
import ConfettiCannon from "react-native-confetti-cannon";
import ViewShot from "react-native-view-shot";
import { useFunnel } from "@/contexts/FunnelContext";
import { usePlumes } from "@/contexts/PlumesContext";
import { MogogoMascot } from "@/components/MogogoMascot";
import { DestinyParchment } from "@/components/DestinyParchment";
import { LoadingMogogo, getNextAnimation, choiceToAnimationCategory } from "@/components/LoadingMogogo";
import { openAction } from "@/services/places";
import { saveSession } from "@/services/history";
import { useTheme } from "@/contexts/ThemeContext";
import { useGrimoire } from "@/hooks/useGrimoire";
import { useShareParchment } from "@/hooks/useShareParchment";
import { getMascotVariant } from "@/utils/mascotVariant";
import type { ThemeColors } from "@/constants";
import { ActionIcon } from "@/utils/actionIcons";
import { PlumeCounter } from "@/components/PlumeCounter";
import type { Action } from "@/types";

if (Platform.OS === "android" && UIManager.setLayoutAnimationEnabledExperimental) {
  UIManager.setLayoutAnimationEnabledExperimental(true);
}

export default function ResultScreen() {
  const router = useRouter();
  const { t } = useTranslation();
  const { state, reroll, refine, reset } = useFunnel();
  const { currentResponse, loading } = state;
  const { refresh: refreshPlumes } = usePlumes();
  const { colors } = useTheme();
  const s = getStyles(colors);
  const { boostTags, penalizeTags } = useGrimoire();

  const [validated, setValidated] = useState(false);
  const [validationAnim, setValidationAnim] = useState<any>(null);
  const [showConfetti, setShowConfetti] = useState(false);

  const recommendation = currentResponse?.recommandation_finale;
  const mascotVariant = getMascotVariant(recommendation?.tags);
  const { viewShotRef, share, sharing } = useShareParchment(recommendation?.titre ?? "");

  const hasRefined = state.history.some((e) => e.choice === "refine");
  const hasRerolled = state.history.some((e) => e.choice === "reroll");

  // Pulse animation pour le pouce vert
  const pulseAnim = useRef(new Animated.Value(1)).current;

  useEffect(() => {
    if (validated) return;
    const pulse = Animated.loop(
      Animated.sequence([
        Animated.timing(pulseAnim, {
          toValue: 1.08,
          duration: 300,
          useNativeDriver: true,
        }),
        Animated.timing(pulseAnim, {
          toValue: 1,
          duration: 300,
          useNativeDriver: true,
        }),
      ])
    );
    pulse.start();
    return () => pulse.stop();
  }, [validated]);

  // Quand le LLM repond en_cours (apres refine), naviguer vers le funnel
  useEffect(() => {
    if (currentResponse?.statut === "en_cours") {
      router.replace("/(main)/home/funnel");
    }
  }, [currentResponse?.statut]);

  // Reset validated si on change de recommandation
  // Si un reroll a déjà été fait, valider automatiquement (skip Phase 1)
  useEffect(() => {
    if (hasRerolled) {
      handleValidate();
    } else {
      setValidated(false);
      setShowConfetti(false);
    }
  }, [currentResponse]);

  // Message rituel stable pour reroll (toujours "free")
  const rerollLoadingMessage = useMemo(() => {
    if (!loading || state.lastChoice !== "reroll") return undefined;
    const idx = Math.floor(Math.random() * 3) + 1;
    return t(`funnel.finalFree${idx}`);
  }, [loading, state.lastChoice]);

  if (loading) {
    return <LoadingMogogo category={choiceToAnimationCategory(state.lastChoice)} message={rerollLoadingMessage} />;
  }

  // Après refine, le LLM répond en_cours → on est sur le point de naviguer vers funnel.
  // Afficher un loading pour éviter un flash de l'écran "pas de recommandation".
  if (currentResponse?.statut === "en_cours") {
    return <LoadingMogogo />;
  }

  if (!recommendation) {
    return (
      <View style={s.container}>
        <MogogoMascot message={t("result.noRecommendation")} />
        <Pressable
          style={s.restartButton}
          onPress={() => {
            reset();
            refreshPlumes();
            router.replace("/(main)/home");
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
    LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut);
    setValidated(true);
    setValidationAnim(getNextAnimation("validation"));
    setShowConfetti(true);
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

  const handleReroll = async () => {
    const tags = recommendation?.tags ?? [];
    if (tags.length > 0) penalizeTags(tags);
    await reroll();
  };

  const handleRestart = () => {
    reset();
    refreshPlumes();
    router.replace("/(main)/home");
  };

  const triggerHaptic = () => {
    if (Platform.OS !== "web") {
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    }
  };

  // Liste contexte utilisateur pour Phase 1
  const contextItems: { icon: React.ComponentProps<typeof Ionicons>["name"]; label: string }[] = [];
  if (state.context) {
    if (state.context.social)
      contextItems.push({ icon: "people-outline", label: t(`context.social.${state.context.social}`) });
    if (state.context.budget)
      contextItems.push({ icon: "wallet-outline", label: t(`context.budgetOptions.${state.context.budget}`) });
    if (state.context.energy != null)
      contextItems.push({ icon: "flash-outline", label: t(`context.energy.level${state.context.energy}`) });
    if (state.context.environment)
      contextItems.push({ icon: "compass-outline", label: t(`context.envOptions.${state.context.environment}`) });
  }

  // Phase 1 : teaser (skip si reroll — le useEffect va appeler handleValidate)
  if (!validated && !hasRerolled) {
    return (
      <View style={{ flex: 1, backgroundColor: colors.background }}>
        {showConfetti && (
          <ConfettiCannon
            count={80}
            origin={{ x: -10, y: 0 }}
            autoStart
            fadeOut
            onAnimationEnd={() => setShowConfetti(false)}
          />
        )}

        <ScrollView
          style={{ flex: 1 }}
          contentContainerStyle={[s.scrollContent, { flexGrow: 1, justifyContent: "center" }]}
        >
          <MogogoMascot
            message={currentResponse?.mogogo_message ?? t("result.defaultSuccess")}
            animationSource={undefined}
          />

          <View style={s.card}>
            <Text style={s.title}>{recommendation.titre}</Text>
            {recommendation.justification && (
              <Text style={s.justification}>{recommendation.justification}</Text>
            )}

            {contextItems.length > 0 && (
              <View style={s.contextList}>
                {contextItems.map((item, i) => (
                  <View key={i} style={s.contextItem}>
                    <Ionicons name={item.icon} size={18} color={colors.primary} />
                    <Text style={s.contextItemText}>{item.label}</Text>
                  </View>
                ))}
              </View>
            )}

            <Text style={s.readyQuestion}>{t("result.readyQuestion")}</Text>
          </View>

          {/* Pouces rouge / vert */}
          <View style={s.thumbRow}>
            <Pressable
              style={[s.thumbButton, s.thumbDislike]}
              onPress={() => {
                triggerHaptic();
                handleReroll();
              }}
            >
              <Ionicons name="thumbs-down" size={28} color="#fff" />
            </Pressable>

            <Animated.View style={{ transform: [{ scale: pulseAnim }] }}>
              <Pressable
                style={[s.thumbButton, s.thumbLike]}
                onPress={() => {
                  triggerHaptic();
                  handleValidate();
                }}
              >
                <Ionicons name="thumbs-up" size={28} color="#fff" />
              </Pressable>
            </Animated.View>
          </View>

          {!hasRefined && !hasRerolled && (
            <Pressable
              style={[s.primaryButton, loading && { opacity: 0.5 }]}
              onPress={refine}
              disabled={loading}
            >
              {loading ? (
                <ActivityIndicator size="small" color={colors.white} />
              ) : (
                <Text style={s.primaryButtonText}>{t("result.refine")}</Text>
              )}
            </Pressable>
          )}

          <Pressable style={s.secondaryButton} onPress={handleRestart}>
            <Text style={s.secondaryText}>{t("common.restart")}</Text>
          </Pressable>
        </ScrollView>
      </View>
    );
  }

  // Phase 2 : apres validation — actions + partage + recommencer
  return (
    <View style={{ flex: 1, backgroundColor: colors.background }}>
      <Stack.Screen
        options={{
          headerRight: () => (
            <View style={{ flexDirection: "row", alignItems: "center" }}>
              <PlumeCounter />
              <Pressable onPress={share} disabled={sharing} style={{ padding: 4 }}>
                <Ionicons name="arrow-redo-outline" size={22} color={colors.text} />
              </Pressable>
            </View>
          ),
        }}
      />
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
            social={state.context?.social}
            tags={recommendation.tags}
            variant={mascotVariant}
          />
        </ViewShot>
      </View>

      {/* Confettis hors ScrollView pour overlay plein ecran */}
      {showConfetti && (
        <ConfettiCannon
          count={80}
          origin={{ x: -10, y: 0 }}
          autoStart
          fadeOut
          onAnimationEnd={() => setShowConfetti(false)}
        />
      )}

      <ScrollView
        style={{ flex: 1 }}
        contentContainerStyle={s.scrollContent}
      >
        <MogogoMascot
          message={hasRerolled ? t("result.rerollResult") : t("grimoire.mogogoBoost")}
          animationSource={hasRerolled ? undefined : validationAnim}
        />

        {/* Carte resultat */}
        <View style={s.card}>
          <Text style={s.title}>{recommendation.titre}</Text>
          {recommendation.justification && (
            <Text style={s.justification}>{recommendation.justification}</Text>
          )}
          <Text style={s.explanation}>{recommendation.explication}</Text>

          {contextItems.length > 0 && (
            <View style={s.contextList}>
              {contextItems.map((item, i) => (
                <View key={i} style={s.contextItem}>
                  <Ionicons name={item.icon} size={18} color={colors.primary} />
                  <Text style={s.contextItemText}>{item.label}</Text>
                </View>
              ))}
            </View>
          )}
        </View>

        {/* Boutons d'action — style normal */}
        {effectiveActions.map((action, index) => (
          <Pressable
            key={index}
            style={s.actionButton}
            onPress={() => handleAction(action)}
          >
            <ActionIcon type={action.type} color={colors.primary} />
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
                social={state.context?.social}
                tags={recommendation.tags}
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

        {/* Bouton reroll */}
        {!hasRerolled && (
          <Pressable style={s.secondaryButton} onPress={handleReroll}>
            <Text style={s.secondaryText}>{t("result.tryAnother")}</Text>
          </Pressable>
        )}

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
    justification: {
      fontSize: 14,
      fontStyle: "italic",
      color: colors.primary,
      marginBottom: 8,
    },
    contextList: {
      flexDirection: "row",
      flexWrap: "wrap",
      marginTop: 16,
      gap: 10,
    },
    contextItem: {
      flexDirection: "row",
      alignItems: "center",
      gap: 10,
      width: "47%",
    },
    contextItemText: {
      fontSize: 15,
      color: colors.text,
    },
    readyQuestion: {
      fontSize: 18,
      fontWeight: "bold",
      color: colors.text,
      textAlign: "center",
      marginTop: 20,
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
    offScreen: {
      position: "absolute",
      left: -10000,
      top: 0,
      width: 350,
      height: 350,
    },
    thumbRow: {
      flexDirection: "row",
      justifyContent: "center",
      gap: 24,
      marginBottom: 24,
    },
    thumbButton: {
      width: 64,
      height: 64,
      borderRadius: 32,
      alignItems: "center",
      justifyContent: "center",
      ...Platform.select({
        ios: {
          shadowColor: "#000",
          shadowOffset: { width: 0, height: 4 },
          shadowOpacity: 0.3,
          shadowRadius: 8,
        },
        android: {
          elevation: 6,
        },
      }),
    },
    thumbDislike: {
      backgroundColor: "#E85D4A",
    },
    thumbLike: {
      backgroundColor: "#2ECC71",
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
      flexDirection: "row",
      gap: 8,
      padding: 14,
      borderRadius: 12,
      borderWidth: 2,
      borderColor: colors.primary,
      width: "100%",
      alignItems: "center",
      justifyContent: "center",
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
