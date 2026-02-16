import { useEffect, useRef, useState } from "react";
import { View, ScrollView, Pressable, Text, TextInput, StyleSheet, Animated, Modal } from "react-native";
import { useRouter } from "expo-router";
import { useTranslation } from "react-i18next";
import { useFunnel } from "@/contexts/FunnelContext";
import { usePlumes } from "@/contexts/PlumesContext";
import { MogogoMascot } from "@/components/MogogoMascot";
import { ChoiceButton } from "@/components/ChoiceButton";
import { LoadingMogogo } from "@/components/LoadingMogogo";
import { AdConsentModal } from "@/components/AdConsentModal";
import { loadRewarded, showRewarded, isRewardedLoaded } from "@/services/admob";
import { PLUMES } from "@/services/plumes";
import { useTheme } from "@/contexts/ThemeContext";
import type { ThemeColors } from "@/constants";

export default function FunnelScreen() {
  const router = useRouter();
  const { t } = useTranslation();
  const {
    state,
    startThemeDuel,
    rejectThemeDuel,
    selectTheme,
    makeDrillChoice,
    forceDrillFinalize,
    dismissPoolExhausted,
    goBack,
    reset,
    retryAfterPlumes,
  } = useFunnel();
  const { isPremium, creditAfterAd, refresh: refreshPlumes } = usePlumes();
  const { colors } = useTheme();
  const s = getStyles(colors);
  const fadeAnim = useRef(new Animated.Value(1)).current;
  const [showAdModal, setShowAdModal] = useState(false);
  const [adNotWatched, setAdNotWatched] = useState(false);
  const [adCreditAttempts, setAdCreditAttempts] = useState(0);
  const [freeText, setFreeText] = useState("");

  // Lancer le duel de thèmes au montage
  useEffect(() => {
    if (state.phase === "theme_duel" && !state.themeDuel && !state.winningTheme && !state.loading && state.context) {
      startThemeDuel();
    }
    if (!isPremium) {
      loadRewarded();
    }
  }, []);

  // Lancer le premier appel drill-down quand on entre en phase drill_down
  useEffect(() => {
    if (state.phase === "drill_down" && !state.currentResponse && !state.loading && state.winningTheme) {
      makeDrillChoice(undefined as any); // Premier appel sans choix
    }
  }, [state.phase, state.winningTheme]);

  // Gestion needsPlumes
  useEffect(() => {
    if (state.needsPlumes) {
      setAdNotWatched(false);
      setAdCreditAttempts(0);
      setShowAdModal(true);
      if (!isRewardedLoaded()) loadRewarded();
    }
  }, [state.needsPlumes]);

  // Navigation vers result quand finalisé
  useEffect(() => {
    if (state.phase === "result" && state.recommendation) {
      router.replace("/(main)/home/result");
    }
  }, [state.phase, state.recommendation]);

  // Animation fade sur changement de réponse
  useEffect(() => {
    if (state.currentResponse && !state.loading) {
      fadeAnim.setValue(0);
      Animated.timing(fadeAnim, {
        toValue: 1,
        duration: 300,
        useNativeDriver: true,
      }).start();
    }
  }, [state.currentResponse]);

  const handleWatchAd = async () => {
    setShowAdModal(false);
    try {
      const earned = await showRewarded();
      if (earned) {
        const credited = await creditAfterAd(PLUMES.AD_REWARD_GATE);
        if (credited) {
          await refreshPlumes();
          await retryAfterPlumes();
          return;
        }
        const attempts = adCreditAttempts + 1;
        setAdCreditAttempts(attempts);
        if (attempts >= 2) {
          await retryAfterPlumes();
          return;
        }
        loadRewarded();
        setShowAdModal(true);
        return;
      }
    } catch { /* fail silencieux */ }
    loadRewarded();
    setAdNotWatched(true);
    setShowAdModal(true);
  };

  const handleGoPremium = async () => {
    setShowAdModal(false);
    const { presentPaywall } = await import("@/services/purchases");
    const purchased = await presentPaywall();
    if (purchased) {
      await refreshPlumes();
      await retryAfterPlumes();
    } else {
      setShowAdModal(true);
    }
  };

  const handleRestart = () => {
    reset();
    refreshPlumes();
    router.replace("/(main)/home");
  };

  // ── Needs Plumes (popup pub) ──
  if (state.needsPlumes) {
    const isStart = state.drillHistory.length === 0 && !state.currentResponse;
    return (
      <View style={s.container}>
        <AdConsentModal
          visible={showAdModal}
          adNotWatched={adNotWatched}
          isSessionStart={isStart}
          onWatchAd={handleWatchAd}
          onGoPremium={handleGoPremium}
          onClose={handleRestart}
        />
      </View>
    );
  }

  // ── Loading ──
  if (state.loading) {
    return <LoadingMogogo message={
      state.phase === "theme_duel" ? t("funnel.preparing") : undefined
    } />;
  }

  // ── Error ──
  if (state.error) {
    return (
      <View style={s.container}>
        <MogogoMascot message={t("funnel.genericError")} />
        <Text style={s.errorText}>{state.error}</Text>
        <ChoiceButton label={t("common.retry")} onPress={startThemeDuel} />
        <View style={{ height: 12 }} />
        <ChoiceButton label={t("common.restart")} variant="secondary" onPress={handleRestart} />
      </View>
    );
  }

  // ══════════════════════════════════════════════════════════════════
  // Phase 2 : Theme Duel
  // ══════════════════════════════════════════════════════════════════
  if (state.phase === "theme_duel" && state.themeDuel) {
    const { themeA, themeB } = state.themeDuel;
    return (
      <ScrollView style={s.scroll} contentContainerStyle={s.scrollContent}>
        <MogogoMascot message={t("funnel.preparing")} />

        <View style={s.buttonsContainer}>
          <ChoiceButton
            label={t(`grimoire.tags.${themeA.slug}`)}
            icon={themeA.emoji}
            onPress={() => selectTheme(themeA.slug, themeA.emoji)}
          />

          <ChoiceButton
            label={t(`grimoire.tags.${themeB.slug}`)}
            icon={themeB.emoji}
            onPress={() => selectTheme(themeB.slug, themeB.emoji)}
          />

          <ChoiceButton
            label={t("funnel.neitherOption")}
            variant="secondary"
            icon={"\u{1F504}"}
            onPress={() => rejectThemeDuel()}
          />
        </View>

        <Pressable style={s.restartButtonFull} onPress={handleRestart}>
          <Text style={s.restartFullText}>{t("common.restart")}</Text>
        </Pressable>

        <AdConsentModal
          visible={showAdModal}
          adNotWatched={adNotWatched}
          onWatchAd={handleWatchAd}
          onGoPremium={handleGoPremium}
        />
      </ScrollView>
    );
  }

  // ══════════════════════════════════════════════════════════════════
  // Phase 2b : Thèmes épuisés — saisie libre
  // ══════════════════════════════════════════════════════════════════
  if (state.phase === "theme_duel" && state.themesExhausted) {
    return (
      <ScrollView style={s.scroll} contentContainerStyle={s.scrollContent} keyboardShouldPersistTaps="handled">
        <MogogoMascot message={t("funnel.themesExhaustedMessage")} />

        <TextInput
          style={s.freeTextInput}
          placeholder={t("funnel.themesExhaustedPlaceholder")}
          placeholderTextColor={colors.textSecondary}
          value={freeText}
          onChangeText={setFreeText}
          multiline
          maxLength={200}
          autoFocus
        />

        <View style={s.buttonsContainer}>
          <ChoiceButton
            label={t("funnel.themesExhaustedSubmit")}
            icon={"\u{2728}"}
            onPress={() => selectTheme(freeText.trim(), "\u{2728}")}
            disabled={freeText.trim().length === 0}
          />

          <ChoiceButton
            label={t("common.restart")}
            variant="secondary"
            onPress={handleRestart}
          />
        </View>
      </ScrollView>
    );
  }

  // ══════════════════════════════════════════════════════════════════
  // Phase 3 : Drill-Down
  // ══════════════════════════════════════════════════════════════════
  if (state.phase === "drill_down") {
    if (!state.currentResponse) {
      return <LoadingMogogo message={t("funnel.preparing")} />;
    }

    const { currentResponse, subcategoryPool, poolIndex } = state;

    // Protection : si finalisé, on attend la navigation
    if (currentResponse.statut === "finalisé") {
      return <LoadingMogogo category="resultat" />;
    }

    // Déterminer les options à afficher : pool actif ou options classiques
    let optA: string | null = null;
    let optB: string | null = null;
    let poolTotal = 0;
    let poolPairIndex = 0;

    if (subcategoryPool && subcategoryPool.length > 0) {
      // Mode pool : afficher la paire courante
      optA = poolIndex < subcategoryPool.length ? subcategoryPool[poolIndex] : null;
      optB = poolIndex + 1 < subcategoryPool.length ? subcategoryPool[poolIndex + 1] : null;
      poolTotal = subcategoryPool.length;
      poolPairIndex = poolIndex;
    } else if (currentResponse.options) {
      // Fallback : options classiques
      optA = currentResponse.options.A;
      optB = currentResponse.options.B;
    }

    return (
      <ScrollView style={s.scroll} contentContainerStyle={s.scrollContent} keyboardShouldPersistTaps="handled">
        <Animated.View style={[s.content, { opacity: fadeAnim }]}>
          <MogogoMascot message={currentResponse.mogogo_message} />

          {currentResponse.question && (
            <Text style={s.question}>{currentResponse.question}</Text>
          )}

          <View style={s.buttonsContainer}>
            {optA && (
              <ChoiceButton
                label={optA}
                onPress={() => makeDrillChoice("A")}
              />
            )}
            {optB && (
              <ChoiceButton
                label={optB}
                onPress={() => makeDrillChoice("B")}
              />
            )}

            <ChoiceButton
              label={t("funnel.neitherOption")}
              variant="secondary"
              icon={"\u{1F504}"}
              onPress={() => makeDrillChoice("neither")}
            />

            {state.drillHistory.length >= 3 && (
              <ChoiceButton
                label={t("funnel.showResult")}
                variant="secondary"
                icon={"\u{1F340}"}
                onPress={forceDrillFinalize}
              />
            )}
          </View>

          {/* Indicateur de progression du pool */}
          {subcategoryPool && poolTotal > 2 && (
            <View style={s.poolDots}>
              {Array.from({ length: Math.ceil(poolTotal / 2) }).map((_, i) => (
                <View
                  key={i}
                  style={[s.poolDot, i === Math.floor(poolPairIndex / 2) && s.poolDotActive]}
                />
              ))}
            </View>
          )}
        </Animated.View>

        <View style={s.footer}>
          {(state.drillHistory.length > 0 || (subcategoryPool && poolIndex > 0)) && (
            <Pressable style={s.footerButton} onPress={goBack}>
              <Text style={s.backText}>{t("funnel.goBack")}</Text>
            </Pressable>
          )}
          <Pressable style={s.footerButton} onPress={handleRestart}>
            <Text style={s.restartFullText}>{t("common.restart")}</Text>
          </Pressable>
        </View>

        {__DEV__ && currentResponse._model_used && (
          <Text style={s.modelBadge}>{currentResponse._model_used}</Text>
        )}

        <AdConsentModal
          visible={showAdModal}
          adNotWatched={adNotWatched}
          onWatchAd={handleWatchAd}
          onGoPremium={handleGoPremium}
        />

        {/* Modale pool épuisé */}
        <Modal
          visible={!!state.poolExhaustedCategory}
          transparent
          animationType="fade"
          onRequestClose={dismissPoolExhausted}
        >
          <View style={s.modalOverlay}>
            <View style={s.modalCard}>
              <MogogoMascot
                message={t(
                  state.drillHistory.length === 0 ? "funnel.poolExhaustedRoot" : "funnel.poolExhausted",
                  { category: state.poolExhaustedCategory ?? "" },
                )}
              />
              <ChoiceButton
                label="OK"
                onPress={dismissPoolExhausted}
              />
            </View>
          </View>
        </Modal>
      </ScrollView>
    );
  }

  // Fallback : loading
  return <LoadingMogogo message={t("funnel.preparing")} />;
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
    freeTextInput: {
      width: "100%" as const,
      minHeight: 80,
      borderWidth: 1,
      borderColor: colors.border,
      borderRadius: 12,
      padding: 14,
      fontSize: 16,
      color: colors.text,
      textAlignVertical: "top" as const,
      marginBottom: 20,
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

    /* ─── Footer ─── */
    footer: {
      flexDirection: "row",
      justifyContent: "space-between",
      paddingTop: 16,
      paddingBottom: 8,
    },
    footerButton: {
      flex: 1,
      padding: 14,
      borderRadius: 12,
      borderWidth: 1,
      borderColor: colors.border,
      alignItems: "center",
    },
    backText: {
      fontSize: 16,
      color: colors.primary,
      fontWeight: "500",
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

    /* ─── Modal pool épuisé ─── */
    modalOverlay: {
      flex: 1,
      backgroundColor: "rgba(0,0,0,0.5)",
      justifyContent: "center" as const,
      alignItems: "center" as const,
      padding: 24,
    },
    modalCard: {
      backgroundColor: colors.background,
      borderRadius: 20,
      padding: 24,
      width: "100%" as const,
      maxWidth: 360,
      alignItems: "center" as const,
      gap: 16,
    },

    /* ─── Pool dots ─── */
    poolDots: {
      flexDirection: "row" as const,
      justifyContent: "center" as const,
      gap: 6,
      marginTop: 16,
    },
    poolDot: {
      width: 8,
      height: 8,
      borderRadius: 4,
      backgroundColor: colors.border,
    },
    poolDotActive: {
      backgroundColor: colors.primary,
    },
  });
