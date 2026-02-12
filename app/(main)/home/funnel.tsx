import { useEffect, useRef, useMemo } from "react";
import { View, ScrollView, Pressable, Text, StyleSheet, Animated } from "react-native";

import { useRouter } from "expo-router";
import { useTranslation } from "react-i18next";
import { useFunnel } from "@/contexts/FunnelContext";
import { usePurchases } from "@/hooks/usePurchases";
import { MogogoMascot } from "@/components/MogogoMascot";
import { ChoiceButton } from "@/components/ChoiceButton";
import { LoadingMogogo, choiceToAnimationCategory } from "@/components/LoadingMogogo";
import { DecisionBreadcrumb } from "@/components/DecisionBreadcrumb";
import { loadInterstitial, showInterstitial } from "@/services/admob";
import { countDeviceSessions } from "@/services/history";
import { useTheme } from "@/contexts/ThemeContext";
import type { ThemeColors } from "@/constants";

export default function FunnelScreen() {
  const router = useRouter();
  const { t } = useTranslation();
  const { state, makeChoice, goBack, jumpToStep, reset } = useFunnel();
  const { currentResponse, loading, error, history } = state;
  const { isPremium } = usePurchases();
  const { colors } = useTheme();
  const s = getStyles(colors);
  const fadeAnim = useRef(new Animated.Value(1)).current;

  const breadcrumbSteps = useMemo(() =>
    state.history
      .map((entry, index) => ({
        index,
        label: entry.choiceLabel ?? (entry.choice === "A" || entry.choice === "B" ? entry.choice : ""),
      }))
      .filter(step => step.label !== ""),
    [state.history]
  );

  // Premier appel LLM au montage + préchargement interstitiel
  useEffect(() => {
    if (!currentResponse && !loading && state.context) {
      makeChoice(undefined);
    }
    if (!isPremium) {
      loadInterstitial();
    }
  }, []);

  // Navigation vers résultat quand finalisé (avec interstitiel pour free ≥ 4è session)
  useEffect(() => {
    if (currentResponse?.statut !== "finalisé") return;

    if (isPremium) {
      router.replace("/(main)/home/result");
      return;
    }

    // Free : vérifier si on dépasse les 3 sessions offertes
    let cancelled = false;
    (async () => {
      try {
        const pastSessions = await countDeviceSessions();
        if (cancelled) return;
        if (pastSessions >= 3) {
          await showInterstitial();
        }
      } catch {
        // fail silencieux — on ne bloque pas le flux
      }
      if (!cancelled) {
        router.replace("/(main)/home/result");
      }
    })();

    return () => { cancelled = true; };
  }, [currentResponse?.statut]);

  // Animation fade sur changement de question
  useEffect(() => {
    if (currentResponse && !loading) {
      fadeAnim.setValue(0);
      Animated.timing(fadeAnim, {
        toValue: 1,
        duration: 300,
        useNativeDriver: true,
      }).start();
    }
  }, [currentResponse]);

  // Écran de chargement plein écran — Mogogo réfléchit (TOUJOURS quand loading)
  if (loading) {
    return <LoadingMogogo category={choiceToAnimationCategory(state.lastChoice)} />;
  }

  if (error) {
    const isQuotaError = error.includes("429") || error.toLowerCase().includes("quota");
    return (
      <View style={s.container}>
        <MogogoMascot
          message={
            isQuotaError
              ? t("funnel.quotaError")
              : t("funnel.genericError")
          }
        />
        <Text style={s.errorText}>{error}</Text>
        {!isQuotaError && (
          <ChoiceButton
            label={t("common.retry")}
            onPress={() => makeChoice(state.lastChoice)}
          />
        )}
        <View style={{ height: 12 }} />
        <ChoiceButton
          label={t("common.restart")}
          variant="secondary"
          onPress={() => {
            reset();
            router.replace("/(main)/home");
          }}
        />
      </View>
    );
  }

  if (!currentResponse) {
    return <LoadingMogogo message={t("funnel.preparing")} />;
  }

  // Éviter un flash des boutons A/B avant la navigation vers result
  if (currentResponse.statut === "finalisé") {
    return <LoadingMogogo category={choiceToAnimationCategory(state.lastChoice)} />;
  }

  return (
    <ScrollView
      style={s.scroll}
      contentContainerStyle={s.scrollContent}
      keyboardShouldPersistTaps="handled"
    >
      {process.env.EXPO_PUBLIC_HIDE_BREADCRUMB !== "true" && breadcrumbSteps.length > 0 && (
        <DecisionBreadcrumb
          steps={breadcrumbSteps}
          onStepPress={jumpToStep}
          disabled={loading}
        />
      )}
      <Animated.View style={[s.content, { opacity: fadeAnim }]}>
        <MogogoMascot message={currentResponse.mogogo_message} />

        {currentResponse.question && (
          <Text style={s.question}>{currentResponse.question}</Text>
        )}

        <View style={s.buttonsContainer}>
          {currentResponse.options && (
            <>
              <ChoiceButton
                label={currentResponse.options.A}
                onPress={() => makeChoice("A")}
              />
              <ChoiceButton
                label={currentResponse.options.B}
                onPress={() => makeChoice("B")}
              />
            </>
          )}

          <View style={s.secondaryRow}>
            <View style={s.secondaryButtonWrapper}>
              <ChoiceButton
                label={t("funnel.dontCare")}
                variant="secondary"
                icon="🎲"
                onPress={() => makeChoice("any")}
              />
            </View>
            <View style={s.secondaryButtonWrapper}>
              <ChoiceButton
                label={t("funnel.neitherOption")}
                variant="secondary"
                icon="🔄"
                onPress={() => makeChoice("neither")}
              />
            </View>
          </View>
        </View>
      </Animated.View>

      {history.length >= 3 && (
        <View style={s.showResultContainer}>
          <ChoiceButton
            label={t("funnel.showResult")}
            variant="primary"
            icon="✨"
            onPress={() => makeChoice("finalize")}
          />
        </View>
      )}

      {process.env.EXPO_PUBLIC_HIDE_BREADCRUMB === "true" ? (
        <Pressable
          style={s.restartButtonFull}
          onPress={() => {
            reset();
            router.replace("/(main)/home");
          }}
        >
          <Text style={s.restartFullText}>{t("common.restart")}</Text>
        </Pressable>
      ) : (
        <View style={s.footer}>
          {history.length > 0 && (
            <Pressable style={s.backButton} onPress={goBack}>
              <Text style={s.backText}>{t("funnel.goBack")}</Text>
            </Pressable>
          )}
          <Pressable
            style={s.restartButton}
            onPress={() => {
              reset();
              router.replace("/(main)/home");
            }}
          >
            <Text style={s.restartText}>{t("common.restart")}</Text>
          </Pressable>
        </View>
      )}

      {__DEV__ && currentResponse._model_used && (
        <Text style={s.modelBadge}>{currentResponse._model_used}</Text>
      )}
    </ScrollView>
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
    scroll: {
      flex: 1,
      backgroundColor: colors.background,
    },
    scrollContent: {
      flexGrow: 1,
      justifyContent: "center",
      padding: 24,
    },
    content: {
      alignItems: "center",
    },
    question: {
      fontSize: 22,
      fontWeight: "bold",
      textAlign: "center",
      marginBottom: 32,
      color: colors.text,
    },
    buttonsContainer: {
      width: "100%",
      gap: 12,
    },
    secondaryRow: {
      flexDirection: "row",
      gap: 12,
    },
    secondaryButtonWrapper: {
      flex: 1,
    },
    errorText: {
      fontSize: 14,
      color: colors.textSecondary,
      textAlign: "center",
      marginBottom: 24,
    },
    showResultContainer: {
      width: "100%",
      paddingTop: 16,
      borderTopWidth: 1,
      borderTopColor: colors.border,
      marginTop: 8,
    },
    footer: {
      flexDirection: "row",
      justifyContent: "space-between",
      paddingTop: 16,
      paddingBottom: 8,
    },
    backButton: {
      padding: 12,
    },
    backText: {
      fontSize: 16,
      color: colors.primary,
      fontWeight: "500",
    },
    restartButton: {
      padding: 12,
    },
    restartText: {
      fontSize: 16,
      color: colors.textSecondary,
    },
    restartButtonFull: {
      padding: 14,
      borderRadius: 12,
      borderWidth: 1,
      borderColor: colors.border,
      width: "100%",
      alignItems: "center",
      marginTop: 6,
    },
    restartFullText: {
      fontSize: 16,
      color: colors.textSecondary,
    },
    modelBadge: {
      fontSize: 10,
      color: colors.textSecondary,
      textAlign: "center",
      opacity: 0.5,
      paddingBottom: 4,
    },
  });
