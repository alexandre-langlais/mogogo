import { useEffect, useRef, useMemo } from "react";
import { View, Pressable, Text, StyleSheet, Animated } from "react-native";
import { ActivityIndicator } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useRouter } from "expo-router";
import { useTranslation } from "react-i18next";
import { useFunnel } from "@/contexts/FunnelContext";
import { MogogoMascot } from "@/components/MogogoMascot";
import { ChoiceButton } from "@/components/ChoiceButton";
import { LoadingMogogo, choiceToAnimationCategory } from "@/components/LoadingMogogo";
import { DecisionBreadcrumb } from "@/components/DecisionBreadcrumb";
import { useTheme } from "@/contexts/ThemeContext";
import type { ThemeColors } from "@/constants";

export default function FunnelScreen() {
  const router = useRouter();
  const { t } = useTranslation();
  const { state, makeChoice, goBack, jumpToStep, reset } = useFunnel();
  const { currentResponse, loading, error, history } = state;
  const { colors } = useTheme();
  const insets = useSafeAreaInsets();
  const s = getStyles(colors);
  const fadeAnim = useRef(new Animated.Value(1)).current;
  const overlayAnim = useRef(new Animated.Value(0)).current;

  const breadcrumbSteps = useMemo(() =>
    state.history
      .map((entry, index) => ({
        index,
        label: entry.choiceLabel ?? (entry.choice === "A" || entry.choice === "B" ? entry.choice : ""),
      }))
      .filter(step => step.label !== ""),
    [state.history]
  );

  // Premier appel LLM au montage
  useEffect(() => {
    if (!currentResponse && !loading && state.context) {
      makeChoice(undefined);
    }
  }, []);

  // Navigation vers résultat quand finalisé
  useEffect(() => {
    if (currentResponse?.statut === "finalisé") {
      router.replace("/(main)/result");
    }
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

  // Animation overlay de chargement (fade-in/out)
  useEffect(() => {
    Animated.timing(overlayAnim, {
      toValue: loading ? 1 : 0,
      duration: 250,
      useNativeDriver: true,
    }).start();
  }, [loading]);

  // Écran de chargement initial (pas de question précédente à montrer)
  if (!currentResponse && loading) {
    return <LoadingMogogo category={choiceToAnimationCategory(state.lastChoice)} />;
  }

  // Écran de chargement complet quand pas de currentResponse
  if (loading && !currentResponse) {
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
            router.replace("/(main)/context");
          }}
        />
      </View>
    );
  }

  if (!currentResponse) {
    return <LoadingMogogo message={t("funnel.preparing")} />;
  }

  return (
    <View style={[s.container, { paddingBottom: 8 + insets.bottom }]}>
      {breadcrumbSteps.length > 0 && (
        <DecisionBreadcrumb
          steps={breadcrumbSteps}
          onStepPress={jumpToStep}
          disabled={loading}
        />
      )}
      <Animated.View style={[s.content, { opacity: loading ? 0.4 : fadeAnim }]}>
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
                disabled={loading}
                chosen={loading && state.lastChoice === "A"}
                faded={loading && state.lastChoice !== "A" && (state.lastChoice === "B")}
              />
              <ChoiceButton
                label={currentResponse.options.B}
                onPress={() => makeChoice("B")}
                disabled={loading}
                chosen={loading && state.lastChoice === "B"}
                faded={loading && state.lastChoice !== "B" && (state.lastChoice === "A")}
              />
            </>
          )}

          {!loading && history.length >= 3 && (
            <ChoiceButton
              label={t("funnel.showResult")}
              variant="primary"
              onPress={() => makeChoice("finalize")}
            />
          )}

          {!loading && (
            <>
              <ChoiceButton
                label={t("funnel.dontCare")}
                variant="secondary"
                onPress={() => makeChoice("any")}
              />
              <ChoiceButton
                label={t("funnel.neitherOption")}
                variant="secondary"
                onPress={() => makeChoice("neither")}
              />
            </>
          )}
        </View>
      </Animated.View>

      {/* Overlay spinner pendant le chargement */}
      {loading && (
        <Animated.View style={[s.loadingOverlay, { opacity: overlayAnim }]} pointerEvents="none">
          <ActivityIndicator size="large" color={colors.primary} />
        </Animated.View>
      )}

      <View style={s.footer}>
        {history.length > 0 && !loading && (
          <Pressable style={s.backButton} onPress={goBack}>
            <Text style={s.backText}>{t("funnel.goBack")}</Text>
          </Pressable>
        )}
        {!loading && (
          <Pressable
            style={s.restartButton}
            onPress={() => {
              reset();
              router.replace("/(main)/context");
            }}
          >
            <Text style={s.restartText}>{t("common.restart")}</Text>
          </Pressable>
        )}
      </View>
    </View>
  );
}

const getStyles = (colors: ThemeColors) =>
  StyleSheet.create({
    container: {
      flex: 1,
      justifyContent: "center",
      padding: 24,
      backgroundColor: colors.background,
    },
    content: {
      flex: 1,
      justifyContent: "center",
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
    errorText: {
      fontSize: 14,
      color: colors.textSecondary,
      textAlign: "center",
      marginBottom: 24,
    },
    loadingOverlay: {
      position: "absolute",
      top: 0,
      left: 0,
      right: 0,
      bottom: 0,
      justifyContent: "center",
      alignItems: "center",
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
  });
