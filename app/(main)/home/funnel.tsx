import { useEffect, useRef, useState } from "react";
import { View, ScrollView, Pressable, Text, TextInput, StyleSheet, Animated, Modal } from "react-native";
import { useRouter } from "expo-router";
import { useTranslation } from "react-i18next";
import { Ionicons } from "@expo/vector-icons";
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

/* ─── Progress Dots ─── */
function ProgressHeader({
  questionNumber,
  totalEstimate,
  colors,
}: {
  questionNumber: number;
  totalEstimate: number;
  colors: ThemeColors;
}) {
  return (
    <View style={progressStyles.container}>
      <View style={progressStyles.dotsRow}>
        {Array.from({ length: totalEstimate }, (_, i) => (
          <View
            key={i}
            style={[
              progressStyles.dot,
              {
                backgroundColor: i < questionNumber ? colors.primary : colors.border,
                width: i === questionNumber - 1 ? 24 : 8,
              },
            ]}
          />
        ))}
      </View>
    </View>
  );
}

const progressStyles = StyleSheet.create({
  container: {
    alignItems: "center",
    paddingTop: 8,
    paddingBottom: 4,
  },
  dotsRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
  },
  dot: {
    height: 8,
    borderRadius: 4,
  },
});

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
    retry,
    retryAfterPlumes,
    startPlacesScan,
    makeOutdoorChoice,
    outdoorGoBack,
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

  // Déclencher le scan quand la phase passe à places_scan (après sélection du thème out-home)
  useEffect(() => {
    if (state.phase === "places_scan" && !state.loading && state.context && !state.scanProgress) {
      startPlacesScan();
    }
  }, [state.phase]);

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

  // Navigation vers result quand finalisé (home) ou convergé (outdoor)
  useEffect(() => {
    if (state.phase === "result" && state.recommendation) {
      router.replace("/(main)/home/result");
    }
    if (state.phase === "result" && state.outdoorActivities && state.candidateIds) {
      router.replace("/(main)/home/result");
    }
  }, [state.phase, state.recommendation, state.candidateIds]);

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

  // Calcul du numéro de question et total estimé
  const questionNumber = (() => {
    if (state.phase === "theme_duel") return 1;
    // drill_down: thème duel = 1, puis chaque step
    return state.drillHistory.length + 2;
  })();
  const totalEstimate = Math.max(5, questionNumber);

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
        <ChoiceButton label={t("common.retry")} onPress={retry} />
        <View style={{ height: 12 }} />
        <ChoiceButton label={t("common.restart")} variant="secondary" onPress={handleRestart} />
      </View>
    );
  }

  // ══════════════════════════════════════════════════════════════════
  // Phase places_scan : Scan Google Places + Pool LLM (out-home)
  // ══════════════════════════════════════════════════════════════════
  if (state.phase === "places_scan") {
    const progress = state.scanProgress;
    const step = progress?.step ?? "scanning";
    const count = progress?.count;

    let message: string;
    if (step === "scanning") {
      message = t("funnel.scanningPlaces");
    } else if (step === "found") {
      message = t("funnel.placesFound", { count: count ?? 0 });
    } else {
      message = t("funnel.buildingPool");
    }

    return (
      <View style={s.container}>
        <MogogoMascot message={message} />
        <View style={s.scanSteps}>
          <View style={[s.scanDot, s.scanDotActive]} />
          <View style={[s.scanDot, step !== "scanning" && s.scanDotActive]} />
          <View style={[s.scanDot, step === "building_pool" && s.scanDotActive]} />
        </View>
        <Text style={s.scanStepLabel}>
          {step === "scanning" ? "1/3" : step === "found" ? "2/3" : "3/3"}
        </Text>
        <Pressable style={s.restartButton} onPress={handleRestart}>
          <Ionicons name="refresh" size={16} color={colors.white} />
          <Text style={s.restartButtonText}>{t("common.restart")}</Text>
        </Pressable>
      </View>
    );
  }

  // ══════════════════════════════════════════════════════════════════
  // Phase outdoor_drill : Navigation dichotomique locale (out-home)
  // ══════════════════════════════════════════════════════════════════
  if (state.phase === "outdoor_drill" && state.dichotomyPool && state.candidateIds) {
    const duel = state.dichotomyPool[state.dichotomyIndex];
    if (!duel) return <LoadingMogogo />;

    const candidateCount = state.candidateIds.length;
    const outdoorQ = state.dichotomyIndex + 2; // +1 for theme duel, +1 for 0-indexed
    const outdoorTotal = Math.max(5, outdoorQ);

    return (
      <View style={s.screen}>
        <ProgressHeader questionNumber={outdoorQ} totalEstimate={outdoorTotal} colors={colors} />

        <ScrollView style={{ flex: 1 }} contentContainerStyle={s.scrollContent} keyboardShouldPersistTaps="handled">
          <MogogoMascot message={state.outdoorMogogoMessage ?? duel.question} />
          <Text style={s.candidateCount}>
            {t("funnel.candidatesLeft", { count: candidateCount })}
          </Text>
          <Text style={s.question}>{duel.question}</Text>

          <View style={s.buttonsContainer}>
            <ChoiceButton label={duel.labelA} icon={"\uD83C\uDF19"} onPress={() => makeOutdoorChoice("A")} />
            <ChoiceButton label={duel.labelB} icon={"\u2600\uFE0F"} onPress={() => makeOutdoorChoice("B")} />
          </View>

          <View style={s.linksRow}>
            <Pressable style={s.neitherLink} onPress={() => makeOutdoorChoice("neither")}>
              <Text style={s.neitherText}>{"\uD83D\uDE45"} {t("funnel.neitherOption")}</Text>
            </Pressable>
          </View>
        </ScrollView>

        <View style={s.footer}>
          {state.dichotomyHistory.length > 0 ? (
            <Pressable style={s.footerBack} onPress={outdoorGoBack}>
              <Ionicons name="arrow-back" size={18} color={colors.textSecondary} />
              <Text style={s.footerBackText}>{t("funnel.goBack")}</Text>
            </Pressable>
          ) : (
            <View />
          )}
          <Pressable style={s.restartButton} onPress={handleRestart}>
            <Ionicons name="refresh" size={16} color={colors.white} />
            <Text style={s.restartButtonText}>{t("common.restart")}</Text>
          </Pressable>
        </View>
      </View>
    );
  }

  // ══════════════════════════════════════════════════════════════════
  // Phase 2 : Theme Duel
  // ══════════════════════════════════════════════════════════════════
  if (state.phase === "theme_duel" && state.themeDuel) {
    const { themeA, themeB } = state.themeDuel;
    return (
      <View style={s.screen}>
        <ProgressHeader questionNumber={1} totalEstimate={5} colors={colors} />

        <ScrollView style={{ flex: 1 }} contentContainerStyle={s.scrollContent}>
          <MogogoMascot message={t("funnel.chooseCategory")} />

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
          </View>

          <View style={s.linksRow}>
            <Pressable style={s.neitherLink} onPress={() => rejectThemeDuel()}>
              <Text style={s.neitherText}>{"\uD83D\uDE45"} {t("funnel.neitherOption")}</Text>
            </Pressable>
          </View>
        </ScrollView>

        <View style={s.footer}>
          <View />
          <Pressable style={s.restartButton} onPress={handleRestart}>
            <Ionicons name="refresh" size={16} color={colors.white} />
            <Text style={s.restartButtonText}>{t("common.restart")}</Text>
          </Pressable>
        </View>

        <AdConsentModal
          visible={showAdModal}
          adNotWatched={adNotWatched}
          onWatchAd={handleWatchAd}
          onGoPremium={handleGoPremium}
        />
      </View>
    );
  }

  // ══════════════════════════════════════════════════════════════════
  // Phase 2b : Thèmes épuisés — saisie libre
  // ══════════════════════════════════════════════════════════════════
  if (state.phase === "theme_duel" && state.themesExhausted) {
    return (
      <View style={s.screen}>
        <ScrollView style={{ flex: 1 }} contentContainerStyle={s.scrollContent} keyboardShouldPersistTaps="handled">
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
              onPress={() => selectTheme(freeText.trim(), "\u{2728}")}
              disabled={freeText.trim().length === 0}
            />
          </View>
        </ScrollView>

        <View style={s.footer}>
          <View />
          <Pressable style={s.restartButton} onPress={handleRestart}>
            <Ionicons name="refresh" size={16} color={colors.white} />
            <Text style={s.restartButtonText}>{t("common.restart")}</Text>
          </Pressable>
        </View>
      </View>
    );
  }

  // ══════════════════════════════════════════════════════════════════
  // Phase 3 : Drill-Down
  // ══════════════════════════════════════════════════════════════════
  if (state.phase === "drill_down") {
    if (!state.currentResponse) {
      return <LoadingMogogo message={t("funnel.preparing")} />;
    }

    const { currentResponse, subcategoryPool, subcategoryEmojis, poolIndex } = state;

    // Protection : si finalisé, on attend la navigation
    if (currentResponse.statut === "finalisé") {
      return <LoadingMogogo category="resultat" />;
    }

    // Déterminer les options à afficher : pool actif ou options classiques
    let optA: string | null = null;
    let optB: string | null = null;
    let emojiA = "\uD83D\uDD2E"; // 🔮 fallback
    let emojiB = "\uD83D\uDD2E";
    let poolTotal = 0;
    let poolPairIndex = 0;

    if (subcategoryPool && subcategoryPool.length > 0) {
      // Mode pool : afficher la paire courante
      optA = poolIndex < subcategoryPool.length ? subcategoryPool[poolIndex] : null;
      optB = poolIndex + 1 < subcategoryPool.length ? subcategoryPool[poolIndex + 1] : null;
      emojiA = subcategoryEmojis?.[poolIndex] ?? "\uD83D\uDD2E";
      emojiB = subcategoryEmojis?.[poolIndex + 1] ?? "\uD83D\uDD2E";
      poolTotal = subcategoryPool.length;
      poolPairIndex = poolIndex;
    } else if (currentResponse.options) {
      // Fallback : options classiques
      optA = currentResponse.options.A;
      optB = currentResponse.options.B;
      emojiA = currentResponse.subcategory_emojis?.[0] ?? "\uD83D\uDD2E";
      emojiB = currentResponse.subcategory_emojis?.[1] ?? "\uD83D\uDD2E";
    }

    return (
      <View style={s.screen}>
        <ProgressHeader questionNumber={questionNumber} totalEstimate={totalEstimate} colors={colors} />

        <ScrollView style={{ flex: 1 }} contentContainerStyle={s.scrollContent} keyboardShouldPersistTaps="handled">
          <Animated.View style={[s.content, { opacity: fadeAnim }]}>
            <MogogoMascot message={currentResponse.mogogo_message} />

            {currentResponse.question && (
              <Text style={s.question}>{currentResponse.question}</Text>
            )}

            <View style={s.buttonsContainer}>
              {optA && (
                <ChoiceButton
                  label={optA}
                  icon={emojiA}
                  onPress={() => makeDrillChoice("A")}
                />
              )}
              {optB && (
                <ChoiceButton
                  label={optB}
                  icon={emojiB}
                  onPress={() => makeDrillChoice("B")}
                />
              )}
            </View>

            {/* Lucky + Neither button */}
            <View style={s.linksRow}>
              {state.drillHistory.length >= 3 && (
                <Pressable style={s.luckyLink} onPress={forceDrillFinalize}>
                  <Ionicons name="sparkles" size={14} color={colors.textSecondary} />
                  <Text style={s.luckyText}>{t("funnel.showResult")}</Text>
                </Pressable>
              )}

              <Pressable style={s.neitherLink} onPress={() => makeDrillChoice("neither")}>
                <Text style={s.neitherText}>{"\uD83D\uDE45"} {t("funnel.neitherOption")}</Text>
              </Pressable>
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
        </ScrollView>

        <View style={s.footer}>
          {(state.drillHistory.length > 0 || (subcategoryPool && poolIndex > 0)) ? (
            <Pressable style={s.footerBack} onPress={goBack}>
              <Ionicons name="arrow-back" size={18} color={colors.textSecondary} />
              <Text style={s.footerBackText}>{t("funnel.goBack")}</Text>
            </Pressable>
          ) : (
            <View />
          )}
          <Pressable style={s.restartButton} onPress={handleRestart}>
            <Ionicons name="refresh" size={16} color={colors.white} />
            <Text style={s.restartButtonText}>{t("common.restart")}</Text>
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
      </View>
    );
  }

  // Fallback : loading
  return <LoadingMogogo message={t("funnel.preparing")} />;
}

const getStyles = (colors: ThemeColors) =>
  StyleSheet.create({
    /* ─── Layout principal ─── */
    screen: {
      flex: 1,
      backgroundColor: "transparent",
    },
    container: {
      flex: 1,
      justifyContent: "center",
      alignItems: "center",
      padding: 24,
      backgroundColor: "transparent",
    },
    scrollContent: {
      flexGrow: 1,
      justifyContent: "center",
      paddingHorizontal: 24,
      paddingBottom: 16,
    },
    content: {
      alignItems: "center",
    },

    /* ─── Question & text ─── */
    question: {
      fontSize: 22,
      fontWeight: "bold",
      textAlign: "center",
      marginBottom: 24,
      color: colors.text,
    },
    candidateCount: {
      fontSize: 13,
      color: colors.textSecondary,
      textAlign: "center",
      marginBottom: 4,
      opacity: 0.7,
    },
    errorText: {
      fontSize: 14,
      color: colors.textSecondary,
      textAlign: "center",
      marginBottom: 24,
    },

    /* ─── Choice buttons ─── */
    buttonsContainer: {
      width: "100%",
      gap: 12,
    },

    /* ─── Neither / Lucky links ─── */
    linksRow: {
      flexDirection: "row",
      justifyContent: "center",
      alignItems: "center",
      gap: 16,
      marginTop: 20,
    },
    neitherLink: {
      paddingVertical: 10,
      paddingHorizontal: 20,
      borderWidth: 1,
      borderColor: colors.border,
      borderRadius: 20,
    },
    neitherText: {
      fontSize: 15,
      color: colors.textSecondary,
      fontWeight: "500",
    },
    luckyLink: {
      flexDirection: "row",
      alignItems: "center",
      gap: 6,
      paddingVertical: 10,
      paddingHorizontal: 20,
      borderWidth: 1,
      borderColor: colors.border,
      borderRadius: 20,
    },
    luckyText: {
      fontSize: 15,
      color: colors.textSecondary,
      fontWeight: "500",
    },

    /* ─── Free text input ─── */
    freeTextInput: {
      width: "100%" as const,
      minHeight: 80,
      borderWidth: 1,
      borderColor: colors.border,
      borderRadius: 12,
      padding: 14,
      fontSize: 16,
      color: colors.text,
      backgroundColor: colors.surface,
      textAlignVertical: "top" as const,
      marginBottom: 20,
    },

    /* ─── Footer ─── */
    footer: {
      flexDirection: "row",
      alignItems: "center",
      justifyContent: "space-between",
      paddingHorizontal: 24,
      paddingVertical: 14,
      borderTopWidth: 1,
      borderTopColor: colors.border,
    },
    footerBack: {
      flexDirection: "row",
      alignItems: "center",
      gap: 6,
      paddingVertical: 10,
      paddingHorizontal: 12,
    },
    footerBackText: {
      fontSize: 15,
      color: colors.textSecondary,
    },
    restartButton: {
      flexDirection: "row",
      alignItems: "center",
      gap: 6,
      backgroundColor: colors.primary,
      paddingVertical: 12,
      paddingHorizontal: 20,
      borderRadius: 12,
    },
    restartButtonText: {
      fontSize: 15,
      fontWeight: "600",
      color: colors.white,
    },

    /* ─── Model badge (dev only) ─── */
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
      backgroundColor: colors.background,
      justifyContent: "center" as const,
      alignItems: "center" as const,
      padding: 24,
    },
    modalCard: {
      backgroundColor: colors.surface,
      borderRadius: 20,
      padding: 24,
      width: "100%" as const,
      maxWidth: 360,
      alignItems: "center" as const,
      gap: 16,
      borderWidth: 1,
      borderColor: colors.border,
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

    /* ─── Scan progress ─── */
    scanSteps: {
      flexDirection: "row" as const,
      justifyContent: "center" as const,
      gap: 10,
      marginTop: 24,
      marginBottom: 8,
    },
    scanDot: {
      width: 12,
      height: 12,
      borderRadius: 6,
      backgroundColor: colors.border,
    },
    scanDotActive: {
      backgroundColor: colors.primary,
    },
    scanStepLabel: {
      fontSize: 14,
      color: colors.textSecondary,
      textAlign: "center" as const,
      marginBottom: 24,
    },
  });
