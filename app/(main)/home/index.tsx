import {
  View,
  Text,
  Pressable,
  StyleSheet,
  Platform,
  Animated,
  ScrollView,
  useWindowDimensions,
  Modal,
} from "react-native";
import { useRouter } from "expo-router";
import { useState, useRef, useCallback, useEffect } from "react";
import { useTranslation } from "react-i18next";
import AsyncStorage from "@react-native-async-storage/async-storage";
import DateTimePicker, {
  DateTimePickerEvent,
} from "@react-native-community/datetimepicker";
import { useFunnel } from "@/contexts/FunnelContext";
import { useLocation } from "@/hooks/useLocation";
import { useTheme } from "@/contexts/ThemeContext";
import { getCurrentLanguage } from "@/i18n";
import { MogogoMascot } from "@/components/MogogoMascot";
import AgeRangeSlider from "@/components/AgeRangeSlider";
import { DailyRewardBanner } from "@/components/DailyRewardBanner";
import {
  SOCIAL_KEYS,
  SOCIAL_I18N,
  BUDGET_KEYS,
  BUDGET_I18N,
  ENVIRONMENT_KEYS,
  ENVIRONMENT_I18N,
} from "@/i18n/contextKeys";
import type { UserContext } from "@/types";
import type { ThemeColors } from "@/constants";
import type { SocialKey, BudgetKey, EnvironmentKey } from "@/i18n/contextKeys";

const TOTAL_STEPS = 5;
const SLIDE_DURATION = 250;

const energyLevels = [1, 2, 3, 4, 5] as const;

const SOCIAL_ICONS: Record<SocialKey, string> = {
  solo: "\u{1F9D1}",
  friends: "\u{1F46B}",
  couple: "\u{1F491}",
  family: "\u{1F46A}",
};

const ENERGY_ICONS: Record<number, string> = {
  1: "\u{1F634}",
  2: "\u{1F60C}",
  3: "\u{1F642}",
  4: "\u{1F4AA}",
  5: "\u{1F525}",
};

const ENERGY_LABELS: Record<number, string> = {
  1: "context.energy.level1",
  2: "context.energy.level2",
  3: "context.energy.level3",
  4: "context.energy.level4",
  5: "context.energy.level5",
};

const BUDGET_ICONS: Record<BudgetKey, string> = {
  free: "\u{1F193}",
  budget: "\u{1FA99}",
  standard: "\u{1F4B3}",
  luxury: "\u{1F48E}",
};

const ENVIRONMENT_ICONS: Record<EnvironmentKey, string> = {
  indoor: "\u{1F3E0}",
  outdoor: "\u{1F333}",
  any_env: "\u{1F30D}",
};

/* ─── Progress Dots ─── */
function ProgressDots({
  current,
  total,
  colors,
}: {
  current: number;
  total: number;
  colors: ThemeColors;
}) {
  return (
    <View style={dotsStyles.row}>
      {Array.from({ length: total }, (_, i) => (
        <View
          key={i}
          style={[
            dotsStyles.dot,
            {
              backgroundColor:
                i <= current ? colors.primary : colors.border,
              width: i === current ? 24 : 8,
            },
          ]}
        />
      ))}
    </View>
  );
}

const dotsStyles = StyleSheet.create({
  row: {
    flexDirection: "row",
    justifyContent: "center",
    alignItems: "center",
    gap: 6,
    marginBottom: 4,
  },
  dot: {
    height: 8,
    borderRadius: 4,
  },
});

export default function ContextScreen() {
  const router = useRouter();
  const { t } = useTranslation();
  const { setContext } = useFunnel();
  const { location } = useLocation();
  const { colors } = useTheme();
  const { width: screenWidth } = useWindowDimensions();
  const s = getStyles(colors);

  const [step, setStep] = useState(0);
  const [social, setSocial] = useState<string>("solo");
  const [energy, setEnergy] = useState<number>(3);
  const [budget, setBudget] = useState<string>("free");
  const [environment, setEnvironment] = useState<string>("indoor");
  const [timing, setTiming] = useState<string>("now");
  const [showDatePicker, setShowDatePicker] = useState(false);
  const [selectedDate, setSelectedDate] = useState<Date>(new Date());
  const [childrenAges, setChildrenAges] = useState({ min: 0, max: 16 });
  const [sliderKey, setSliderKey] = useState(0);
  const [showTrainingModal, setShowTrainingModal] = useState(false);

  useEffect(() => {
    AsyncStorage.getItem("mogogo_training_completed").then((value) => {
      if (value !== "true") {
        const timer = setTimeout(() => setShowTrainingModal(true), 500);
        return () => clearTimeout(timer);
      }
    });
  }, []);

  const handleStartTraining = () => {
    setShowTrainingModal(false);
    router.push("/(main)/training");
  };

  const handleSkipTraining = () => {
    setShowTrainingModal(false);
    AsyncStorage.setItem("mogogo_training_completed", "true");
  };

  const slideAnim = useRef(new Animated.Value(0)).current;
  const dateOpacity = useRef(new Animated.Value(0)).current;
  // Scale anims for social cards
  const socialScales = useRef(
    SOCIAL_KEYS.reduce(
      (acc, key) => ({ ...acc, [key]: new Animated.Value(1) }),
      {} as Record<SocialKey, Animated.Value>,
    ),
  ).current;

  // Scale anims for energy emojis
  const energyScales = useRef(
    energyLevels.reduce(
      (acc, level) => ({ ...acc, [level]: new Animated.Value(level === 3 ? 1.4 : 1) }),
      {} as Record<number, Animated.Value>,
    ),
  ).current;

  // Budget indicator position
  const budgetSlideX = useRef(new Animated.Value(0)).current;

  // Scale anims for environment cards
  const envScales = useRef(
    ENVIRONMENT_KEYS.reduce(
      (acc, key) => ({ ...acc, [key]: new Animated.Value(1) }),
      {} as Record<EnvironmentKey, Animated.Value>,
    ),
  ).current;

  const isValid = social && budget && environment;
  const canStart = !!isValid;

  const formatDate = (date: Date) => {
    const lang = getCurrentLanguage();
    const localeMap: Record<string, string> = {
      fr: "fr-FR",
      en: "en-US",
      es: "es-ES",
    };
    return date.toLocaleDateString(localeMap[lang] ?? "en-US", {
      weekday: "long",
      day: "numeric",
      month: "long",
      year: "numeric",
    });
  };

  const handleDateChange = (_event: DateTimePickerEvent, date?: Date) => {
    if (Platform.OS === "android") {
      setShowDatePicker(false);
    }
    if (date) {
      setSelectedDate(date);
      setTiming(date.toISOString().split("T")[0]);
    } else {
      setTiming("now");
    }
  };

  const handleStart = () => {
    const ctx: UserContext = {
      social,
      energy,
      budget,
      environment,
      timing,
      language: getCurrentLanguage(),
      ...(location && { location }),
      ...(social === "family" && { children_ages: childrenAges }),
    };
    setContext(ctx);
    router.push("/(main)/home/funnel");
  };

  /* ─── Animations helpers ─── */
  const animateSlide = useCallback(
    (direction: 1 | -1, onMid: () => void) => {
      Animated.timing(slideAnim, {
        toValue: -direction * screenWidth,
        duration: SLIDE_DURATION,
        useNativeDriver: true,
      }).start(() => {
        onMid();
        slideAnim.setValue(direction * screenWidth);
        Animated.timing(slideAnim, {
          toValue: 0,
          duration: SLIDE_DURATION,
          useNativeDriver: true,
        }).start(() => {
          setSliderKey((k) => k + 1);
        });
      });
    },
    [slideAnim, screenWidth],
  );

  const pulseScale = (anim: Animated.Value) => {
    Animated.sequence([
      Animated.timing(anim, {
        toValue: 1.08,
        duration: 120,
        useNativeDriver: true,
      }),
      Animated.timing(anim, {
        toValue: 1,
        duration: 120,
        useNativeDriver: true,
      }),
    ]).start();
  };

  const springScale = (anim: Animated.Value, toValue: number) => {
    Animated.spring(anim, {
      toValue,
      friction: 5,
      tension: 100,
      useNativeDriver: true,
    }).start();
  };

  const goNext = () => {
    if (step < TOTAL_STEPS - 1) {
      animateSlide(1, () => setStep((s) => s + 1));
    }
  };

  const goBack = () => {
    if (step > 0) {
      animateSlide(-1, () => setStep((s) => s - 1));
    }
  };



  const handleSocialSelect = (key: SocialKey) => {
    setSocial(key);
    pulseScale(socialScales[key]);
    if (key !== "family") {
      setChildrenAges({ min: 0, max: 16 });
    }
  };

  const handleEnergySelect = (level: number) => {
    // Shrink previous, grow new
    energyLevels.forEach((l) => {
      springScale(energyScales[l], l === level ? 1.4 : 1);
    });
    setEnergy(level);
  };

  const handleBudgetSelect = (key: BudgetKey) => {
    const idx = BUDGET_KEYS.indexOf(key);
    Animated.timing(budgetSlideX, {
      toValue: idx,
      duration: 200,
      useNativeDriver: true,
    }).start();
    setBudget(key);
  };

  const handleEnvSelect = (key: EnvironmentKey) => {
    setEnvironment(key);
    pulseScale(envScales[key]);
  };

  const handleTimingDate = () => {
    setTiming(selectedDate.toISOString().split("T")[0]);
    setShowDatePicker(true);
    Animated.timing(dateOpacity, {
      toValue: 1,
      duration: 300,
      useNativeDriver: true,
    }).start();
  };

  const handleTimingNow = () => {
    setTiming("now");
    setShowDatePicker(false);
    dateOpacity.setValue(0);
  };

  /* ─── Step renderers ─── */
  const renderSocialStep = () => (
    <View>
      <Text style={s.stepTitle}>
        {"\u{1F465}"} {t("context.withWho")}
      </Text>
      <View style={s.socialGrid}>
        {SOCIAL_KEYS.map((key) => (
          <Animated.View
            key={key}
            style={[
              s.socialCard,
              social === key && s.socialCardActive,
              { transform: [{ scale: socialScales[key] }] },
            ]}
          >
            <Pressable
              style={s.socialCardInner}
              onPress={() => handleSocialSelect(key)}
            >
              <Text style={s.socialIcon}>{SOCIAL_ICONS[key]}</Text>
              <Text
                style={[
                  s.socialLabel,
                  social === key && s.socialLabelActive,
                ]}
              >
                {t(SOCIAL_I18N[key])}
              </Text>
            </Pressable>
          </Animated.View>
        ))}
      </View>

      {social === "family" && (
        <AgeRangeSlider
          key={sliderKey}
          value={childrenAges}
          onValueChange={setChildrenAges}
        />
      )}
    </View>
  );

  const renderEnergyStep = () => (
    <View>
      <Text style={s.stepTitle}>
        {"\u26A1"} {t("context.energyLevel")}
      </Text>
      <View style={s.energyRow}>
        {energyLevels.map((level) => (
          <Pressable
            key={level}
            onPress={() => handleEnergySelect(level)}
            style={s.energyItem}
          >
            <Animated.Text
              style={[
                s.energyEmoji,
                { transform: [{ scale: energyScales[level] }] },
              ]}
            >
              {ENERGY_ICONS[level]}
            </Animated.Text>
            <View
              style={[
                s.energyDot,
                {
                  backgroundColor:
                    energy === level ? colors.primary : "transparent",
                },
              ]}
            />
          </Pressable>
        ))}
      </View>
      <Text style={s.energyLabel}>{t(ENERGY_LABELS[energy])}</Text>
    </View>
  );

  const renderBudgetStep = () => {
    const segmentWidth = (screenWidth - 48 - 8) / BUDGET_KEYS.length;
    return (
      <View>
        <Text style={s.stepTitle}>
          {"\u{1F4B0}"} {t("context.budget")}
        </Text>
        <View style={s.budgetContainer}>
          <Animated.View
            style={[
              s.budgetIndicator,
              {
                width: segmentWidth,
                backgroundColor: colors.primary,
                transform: [
                  {
                    translateX: budgetSlideX.interpolate({
                      inputRange: [0, BUDGET_KEYS.length - 1],
                      outputRange: [0, segmentWidth * (BUDGET_KEYS.length - 1)],
                    }),
                  },
                ],
              },
            ]}
          />
          {BUDGET_KEYS.map((key) => (
            <Pressable
              key={key}
              style={[s.budgetSegment, { width: segmentWidth }]}
              onPress={() => handleBudgetSelect(key)}
            >
              <Text
                style={[
                  s.budgetEmoji,
                  budget === key && s.budgetTextActive,
                ]}
              >
                {BUDGET_ICONS[key]}
              </Text>
              <Text
                style={[
                  s.budgetLabel,
                  budget === key && s.budgetTextActive,
                ]}
              >
                {t(BUDGET_I18N[key])}
              </Text>
            </Pressable>
          ))}
        </View>
      </View>
    );
  };

  const renderEnvironmentStep = () => (
    <View>
      <Text style={s.stepTitle}>
        {"\u{1F33F}"} {t("context.environment")}
      </Text>
      <View style={s.envRow}>
        {ENVIRONMENT_KEYS.map((key) => (
          <Animated.View
            key={key}
            style={[
              s.envCard,
              environment === key && s.envCardActive,
              { transform: [{ scale: envScales[key] }] },
            ]}
          >
            <Pressable
              style={s.envCardInner}
              onPress={() => handleEnvSelect(key)}
            >
              <Text style={s.envIcon}>{ENVIRONMENT_ICONS[key]}</Text>
              <Text
                style={[
                  s.envLabel,
                  environment === key && s.envLabelActive,
                ]}
              >
                {t(ENVIRONMENT_I18N[key])}
              </Text>
            </Pressable>
          </Animated.View>
        ))}
      </View>
    </View>
  );

  const renderTimingStep = () => (
    <View>
      <Text style={s.stepTitle}>
        {"\u{23F0}"} {t("context.when")}
      </Text>
      <View style={s.timingRow}>
        <Pressable
          style={[s.timingCard, timing === "now" && s.timingCardActive]}
          onPress={handleTimingNow}
        >
          <Text style={s.timingIcon}>{"\u26A1"}</Text>
          <Text
            style={[
              s.timingLabel,
              timing === "now" && s.timingLabelActive,
            ]}
          >
            {t("context.now")}
          </Text>
        </Pressable>
        <Pressable
          style={[s.timingCard, timing !== "now" && s.timingCardActive]}
          onPress={handleTimingDate}
        >
          <Text style={s.timingIcon}>{"\u{1F4C5}"}</Text>
          <Text
            style={[
              s.timingLabel,
              timing !== "now" && s.timingLabelActive,
            ]}
          >
            {t("context.specificDate")}
          </Text>
        </Pressable>
      </View>

      {timing !== "now" && !showDatePicker && (
        <Pressable onPress={() => setShowDatePicker(true)}>
          <Text style={s.selectedDate}>
            {formatDate(selectedDate)} {"\u270E"}
          </Text>
        </Pressable>
      )}

      {showDatePicker && (
        <Animated.View style={{ opacity: dateOpacity }}>
          <DateTimePicker
            value={selectedDate}
            mode="date"
            display={Platform.OS === "ios" ? "inline" : "calendar"}
            minimumDate={new Date()}
            onChange={handleDateChange}
          />
        </Animated.View>
      )}

      {location && (
        <Text style={s.locationInfo}>{t("context.locationActive")}</Text>
      )}

    </View>
  );

  const steps = [
    renderSocialStep,
    renderEnergyStep,
    renderBudgetStep,
    renderEnvironmentStep,
    renderTimingStep,
  ];

  return (
    <View
      style={[
        s.screen,
        { backgroundColor: colors.background },
      ]}
    >
      {/* ─── Daily reward banner ─── */}
      <DailyRewardBanner />

      {/* ─── Header: progress dots ─── */}
      <View style={s.header}>
        <ProgressDots current={step} total={TOTAL_STEPS} colors={colors} />
        <Text style={s.stepIndicator}>
          {t("context.wizard.stepOf", {
            current: step + 1,
            total: TOTAL_STEPS,
          })}
        </Text>
      </View>

      {/* ─── Step content ─── */}
      <Animated.View
        style={[
          s.content,
          { transform: [{ translateX: slideAnim }] },
        ]}
      >
        <ScrollView
          contentContainerStyle={s.contentScroll}
          showsVerticalScrollIndicator={false}
          keyboardShouldPersistTaps="handled"
        >
          {steps[step]()}
        </ScrollView>
      </Animated.View>

      {/* ─── Footer navigation ─── */}
      <View style={s.footer}>
        {step === 0 ? (
          <Pressable
            style={s.footerButtonSecondary}
            onPress={() => router.push("/(main)/grimoire")}
          >
            <Text style={[s.footerButtonSecondaryText, { color: colors.primary }]}>
              {"\u{1F4D6}"} {t("grimoire.openGrimoire")}
            </Text>
          </Pressable>
        ) : (
          <Pressable style={s.footerButtonSecondary} onPress={goBack}>
            <Text style={[s.footerButtonSecondaryText, { color: colors.primary }]}>
              {"\u2190"} {t("common.back")}
            </Text>
          </Pressable>
        )}

        {step < TOTAL_STEPS - 1 ? (
          <Pressable
            style={s.footerButtonPrimary}
            onPress={goNext}
          >
            <Text style={s.footerButtonPrimaryText}>
              {t("context.wizard.next")} {"\u2192"}
            </Text>
          </Pressable>
        ) : (
          <Pressable
            style={[
              s.footerButtonPrimary,
              !canStart && s.footerButtonDisabled,
            ]}
            onPress={handleStart}
            disabled={!canStart}
          >
            <Text style={s.footerButtonPrimaryText}>
              {"\u{1F680}"} {t("context.letsGo")}
            </Text>
          </Pressable>
        )}
      </View>

      {/* Onboarding training modal */}
      <Modal
        visible={showTrainingModal}
        transparent
        animationType="fade"
        onRequestClose={handleSkipTraining}
      >
        <Pressable style={s.modalOverlay} onPress={handleSkipTraining}>
          <View style={s.modalContent} onStartShouldSetResponder={() => true}>
            <MogogoMascot message={t("training.onboardingMessage")} />
            <Text style={s.modalSubtitle}>{t("training.onboardingSubtitle")}</Text>
            <Pressable style={s.modalPrimaryButton} onPress={handleStartTraining}>
              <Text style={s.modalPrimaryText}>{t("training.start")}</Text>
            </Pressable>
            <Pressable style={s.modalSecondaryButton} onPress={handleSkipTraining}>
              <Text style={s.modalSecondaryText}>{t("training.later")}</Text>
            </Pressable>
            <Text style={s.modalHint}>{t("training.settingsHint")}</Text>
          </View>
        </Pressable>
      </Modal>
    </View>
  );
}

const getStyles = (colors: ThemeColors) =>
  StyleSheet.create({
    screen: {
      flex: 1,
      paddingHorizontal: 24,
    },

    /* ─── Header ─── */
    header: {
      alignItems: "center",
      marginTop: 12,
      marginBottom: 8,
    },
    stepIndicator: {
      fontSize: 13,
      color: colors.textSecondary,
      marginTop: 6,
    },

    /* ─── Content ─── */
    content: {
      flex: 1,
    },
    contentScroll: {
      flexGrow: 1,
      justifyContent: "center",
    },
    stepTitle: {
      fontSize: 22,
      fontWeight: "700",
      color: colors.text,
      textAlign: "center",
      marginBottom: 32,
    },

    /* ─── Social step (2×2 grid) ─── */
    socialGrid: {
      flexDirection: "row",
      flexWrap: "wrap",
      justifyContent: "center",
      gap: 12,
    },
    socialCard: {
      width: "46%",
      borderRadius: 16,
      borderWidth: 2,
      borderColor: colors.border,
      backgroundColor: colors.surface,
      overflow: "hidden",
    },
    socialCardActive: {
      backgroundColor: colors.primary,
      borderColor: colors.primary,
    },
    socialCardInner: {
      alignItems: "center",
      paddingVertical: 20,
    },
    socialIcon: {
      fontSize: 40,
      marginBottom: 8,
    },
    socialLabel: {
      fontSize: 16,
      fontWeight: "600",
      color: colors.text,
    },
    socialLabelActive: {
      color: colors.white,
    },

    /* ─── Energy step ─── */
    energyRow: {
      flexDirection: "row",
      justifyContent: "space-evenly",
    },
    energyItem: {
      alignItems: "center",
    },
    energyEmoji: {
      fontSize: 48,
    },
    energyDot: {
      width: 8,
      height: 8,
      borderRadius: 4,
      marginTop: 8,
    },
    energyLabel: {
      fontSize: 18,
      fontWeight: "600",
      color: colors.textSecondary,
      textAlign: "center",
      marginTop: 20,
    },

    /* ─── Budget step (segmented control) ─── */
    budgetContainer: {
      flexDirection: "row",
      backgroundColor: colors.surface,
      borderRadius: 16,
      padding: 4,
      position: "relative",
      overflow: "hidden",
    },
    budgetIndicator: {
      position: "absolute",
      top: 4,
      left: 4,
      bottom: 4,
      borderRadius: 12,
    },
    budgetSegment: {
      alignItems: "center",
      paddingVertical: 16,
      zIndex: 1,
    },
    budgetEmoji: {
      fontSize: 24,
      marginBottom: 4,
    },
    budgetLabel: {
      fontSize: 13,
      fontWeight: "500",
      color: colors.text,
    },
    budgetTextActive: {
      color: colors.white,
    },

    /* ─── Environment step (3 cards row) ─── */
    envRow: {
      flexDirection: "row",
      justifyContent: "center",
      gap: 12,
    },
    envCard: {
      flex: 1,
      borderRadius: 16,
      borderWidth: 2,
      borderColor: colors.border,
      backgroundColor: colors.surface,
      overflow: "hidden",
    },
    envCardActive: {
      backgroundColor: colors.primary,
      borderColor: colors.primary,
    },
    envCardInner: {
      alignItems: "center",
      paddingVertical: 24,
    },
    envIcon: {
      fontSize: 40,
      marginBottom: 8,
    },
    envLabel: {
      fontSize: 14,
      fontWeight: "600",
      color: colors.text,
    },
    envLabelActive: {
      color: colors.white,
    },

    /* ─── Timing step ─── */
    timingRow: {
      flexDirection: "row",
      justifyContent: "center",
      gap: 12,
    },
    timingCard: {
      flex: 1,
      alignItems: "center",
      paddingVertical: 24,
      borderRadius: 16,
      borderWidth: 2,
      borderColor: colors.border,
      backgroundColor: colors.surface,
    },
    timingCardActive: {
      backgroundColor: colors.primary,
      borderColor: colors.primary,
    },
    timingIcon: {
      fontSize: 40,
      marginBottom: 8,
    },
    timingLabel: {
      fontSize: 16,
      fontWeight: "600",
      color: colors.text,
    },
    timingLabelActive: {
      color: colors.white,
    },
    selectedDate: {
      marginTop: 16,
      fontSize: 15,
      color: colors.primary,
      fontWeight: "500",
      textAlign: "center",
    },
    locationInfo: {
      marginTop: 16,
      fontSize: 13,
      color: colors.primary,
      fontStyle: "italic",
      textAlign: "center",
    },
    /* ─── Footer ─── */
    footer: {
      flexDirection: "row",
      justifyContent: "space-between",
      gap: 12,
      marginTop: 8,
    },
    footerButtonSecondary: {
      flex: 1,
      paddingVertical: 14,
      borderRadius: 12,
      borderWidth: 1,
      borderColor: colors.primary,
      alignItems: "center",
    },
    footerButtonSecondaryText: {
      fontSize: 16,
      fontWeight: "600",
    },
    footerButtonPrimary: {
      flex: 1,
      paddingVertical: 14,
      borderRadius: 12,
      backgroundColor: colors.primary,
      alignItems: "center",
    },
    footerButtonPrimaryText: {
      fontSize: 16,
      fontWeight: "600",
      color: colors.white,
    },
    footerButtonDisabled: {
      opacity: 0.5,
    },

    /* Training onboarding modal */
    modalOverlay: {
      flex: 1,
      backgroundColor: "rgba(0,0,0,0.5)",
      justifyContent: "center",
      alignItems: "center",
      padding: 32,
    },
    modalContent: {
      backgroundColor: colors.background,
      borderRadius: 20,
      padding: 24,
      width: "100%",
      maxWidth: 340,
      alignItems: "center",
    },
    modalSubtitle: {
      fontSize: 14,
      color: colors.textSecondary,
      textAlign: "center",
      marginBottom: 20,
      lineHeight: 20,
    },
    modalPrimaryButton: {
      backgroundColor: colors.primary,
      borderRadius: 12,
      paddingVertical: 14,
      paddingHorizontal: 32,
      width: "100%",
      alignItems: "center",
      marginBottom: 10,
    },
    modalPrimaryText: {
      color: colors.white,
      fontSize: 16,
      fontWeight: "700",
    },
    modalSecondaryButton: {
      paddingVertical: 10,
      marginBottom: 12,
    },
    modalSecondaryText: {
      color: colors.textSecondary,
      fontSize: 15,
      fontWeight: "500",
    },
    modalHint: {
      fontSize: 12,
      color: colors.textSecondary,
      fontStyle: "italic",
      textAlign: "center",
    },
  });
