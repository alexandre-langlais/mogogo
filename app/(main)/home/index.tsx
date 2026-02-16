import {
  View,
  Text,
  TextInput,
  Pressable,
  StyleSheet,
  Animated,
  ScrollView,
  useWindowDimensions,
  Modal,
} from "react-native";
import { useRouter } from "expo-router";
import { useState, useRef, useCallback, useEffect } from "react";
import { useTranslation } from "react-i18next";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { useFunnel } from "@/contexts/FunnelContext";
import { useLocation } from "@/hooks/useLocation";
import { useTheme } from "@/contexts/ThemeContext";
import { getCurrentLanguage } from "@/i18n";
import { MogogoMascot } from "@/components/MogogoMascot";
import AgeRangeSlider from "@/components/AgeRangeSlider";
import { DailyRewardBanner } from "@/components/DailyRewardBanner";
import { TAG_CATALOG } from "@/constants/tags";
import {
  SOCIAL_KEYS,
  SOCIAL_I18N,
  BUDGET_KEYS,
  BUDGET_I18N,
  ENVIRONMENT_KEYS,
  ENVIRONMENT_I18N,
} from "@/i18n/contextKeys";
import type { UserContextV3 } from "@/types";
import type { ThemeColors } from "@/constants";
import type { SocialKey, BudgetKey, EnvironmentKey } from "@/i18n/contextKeys";

const SLIDE_DURATION = 250;

const energyLevels = [1, 2, 3, 4, 5] as const;

const ALL_TAG_SLUGS = Object.keys(TAG_CATALOG);

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
  env_home: "\u{1F3E0}",
  env_shelter: "\u{2602}\u{FE0F}",
  env_open_air: "\u{2600}\u{FE0F}",
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
  const [environment, setEnvironment] = useState<string>("env_home");
  const [childrenAges, setChildrenAges] = useState({ min: 0, max: 16 });
  const [sliderKey, setSliderKey] = useState(0);
  const [showTrainingModal, setShowTrainingModal] = useState(false);
  // Q0 state
  const [q0Mode, setQ0Mode] = useState<"carte_blanche" | "have_idea">("carte_blanche");
  const [userHint, setUserHint] = useState("");
  const [userHintTags, setUserHintTags] = useState<string[]>([]);
  // Rayon state
  const [searchRadius, setSearchRadius] = useState<number>(10000);

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

  const TOTAL_STEPS = 5;

  const isValid = social && budget && environment;
  const canStart = !!isValid;

  const handleStart = () => {
    const ctx: UserContextV3 = {
      social,
      energy,
      budget,
      environment,
      language: getCurrentLanguage(),
      ...(location && { location }),
      ...(social === "family" && { children_ages: childrenAges }),
      ...(q0Mode === "have_idea" && userHint.trim() && { user_hint: userHint.trim() }),
      ...(q0Mode === "have_idea" && userHintTags.length > 0 && { user_hint_tags: userHintTags }),
      ...(environment !== "env_home" && { search_radius: searchRadius }),
      datetime: new Date().toISOString(),
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

  const toggleHintTag = (slug: string) => {
    setUserHintTags((prev) =>
      prev.includes(slug) ? prev.filter((s) => s !== slug) : [...prev, slug],
    );
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

  const RADIUS_OPTIONS = [
    { value: 2000, label: "2 km" },
    { value: 10000, label: "10 km" },
    { value: 30000, label: "30 km" },
  ] as const;

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

      {environment !== "env_home" && (
        <View style={s.radiusSection}>
          <Text style={s.radiusTitle}>
            {"\u{1F4CD}"} {t("context.radius.title")}
          </Text>
          <View style={s.radiusRow}>
            {RADIUS_OPTIONS.map((opt) => (
              <Pressable
                key={opt.value}
                style={[
                  s.radiusChip,
                  searchRadius === opt.value && s.radiusChipActive,
                ]}
                onPress={() => setSearchRadius(opt.value)}
              >
                <Text
                  style={[
                    s.radiusChipText,
                    searchRadius === opt.value && s.radiusChipTextActive,
                  ]}
                >
                  {opt.label}
                </Text>
              </Pressable>
            ))}
          </View>
        </View>
      )}
    </View>
  );

  const renderQ0Step = () => (
    <View>
      <Text style={s.stepTitle}>
        {"\u{1F4A1}"} {t("context.q0.title")}
      </Text>
      <View style={s.socialGrid}>
        <Pressable
          style={[
            s.q0Card,
            q0Mode === "have_idea" && s.socialCardActive,
          ]}
          onPress={() => setQ0Mode("have_idea")}
        >
          <Text style={s.socialIcon}>{"\u{1F4AD}"}</Text>
          <Text style={[s.socialLabel, q0Mode === "have_idea" && s.socialLabelActive]}>
            {t("context.q0.haveIdea")}
          </Text>
          <Text style={[s.q0Desc, q0Mode === "have_idea" && s.socialLabelActive]}>
            {t("context.q0.haveIdeaDesc")}
          </Text>
        </Pressable>
        <Pressable
          style={[
            s.q0Card,
            q0Mode === "carte_blanche" && s.socialCardActive,
          ]}
          onPress={() => setQ0Mode("carte_blanche")}
        >
          <Text style={s.socialIcon}>{"\u{2728}"}</Text>
          <Text style={[s.socialLabel, q0Mode === "carte_blanche" && s.socialLabelActive]}>
            {t("context.q0.carteBlanche")}
          </Text>
          <Text style={[s.q0Desc, q0Mode === "carte_blanche" && s.socialLabelActive]}>
            {t("context.q0.carteBlancheDesc")}
          </Text>
        </Pressable>
      </View>

      {q0Mode === "have_idea" && (
        <View style={s.q0InputSection}>
          <TextInput
            style={s.q0Input}
            value={userHint}
            onChangeText={setUserHint}
            placeholder={t("context.q0.hintPlaceholder")}
            placeholderTextColor={colors.textSecondary}
            multiline
            maxLength={200}
          />
          <Text style={s.q0TagsTitle}>{t("context.q0.tagsTitle")}</Text>
          <View style={s.q0TagsGrid}>
            {ALL_TAG_SLUGS.map((slug) => {
              const tag = TAG_CATALOG[slug];
              const isActive = userHintTags.includes(slug);
              return (
                <Pressable
                  key={slug}
                  style={[s.q0TagChip, isActive && s.q0TagChipActive]}
                  onPress={() => toggleHintTag(slug)}
                >
                  <Text style={s.q0TagEmoji}>{tag.emoji}</Text>
                  <Text style={[s.q0TagLabel, isActive && s.q0TagLabelActive]}>
                    {t(tag.labelKey)}
                  </Text>
                </Pressable>
              );
            })}
          </View>
        </View>
      )}
    </View>
  );

  const steps = [
    renderEnvironmentStep,
    renderSocialStep,
    renderEnergyStep,
    renderBudgetStep,
    renderQ0Step,
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

    /* ─── Q0 step ─── */
    q0Card: {
      width: "46%",
      borderRadius: 16,
      borderWidth: 2,
      borderColor: colors.border,
      backgroundColor: colors.surface,
      alignItems: "center",
      paddingVertical: 20,
      paddingHorizontal: 8,
    },
    q0Desc: {
      fontSize: 12,
      color: colors.textSecondary,
      textAlign: "center",
      marginTop: 4,
    },
    q0InputSection: {
      marginTop: 20,
    },
    q0Input: {
      borderWidth: 1,
      borderColor: colors.border,
      borderRadius: 12,
      padding: 14,
      fontSize: 15,
      color: colors.text,
      backgroundColor: colors.surface,
      minHeight: 60,
      textAlignVertical: "top",
    },
    q0TagsTitle: {
      fontSize: 14,
      fontWeight: "600",
      color: colors.textSecondary,
      marginTop: 16,
      marginBottom: 8,
    },
    q0TagsGrid: {
      flexDirection: "row",
      flexWrap: "wrap",
      gap: 8,
    },
    q0TagChip: {
      flexDirection: "row",
      alignItems: "center",
      gap: 4,
      paddingHorizontal: 12,
      paddingVertical: 8,
      borderRadius: 20,
      borderWidth: 1,
      borderColor: colors.border,
      backgroundColor: colors.surface,
    },
    q0TagChipActive: {
      backgroundColor: colors.primary,
      borderColor: colors.primary,
    },
    q0TagEmoji: {
      fontSize: 14,
    },
    q0TagLabel: {
      fontSize: 13,
      color: colors.text,
    },
    q0TagLabelActive: {
      color: colors.white,
    },

    /* ─── Radius chips ─── */
    radiusSection: {
      marginTop: 24,
    },
    radiusTitle: {
      fontSize: 15,
      fontWeight: "600",
      color: colors.text,
      textAlign: "center",
      marginBottom: 12,
    },
    radiusRow: {
      flexDirection: "row",
      justifyContent: "center",
      gap: 12,
    },
    radiusChip: {
      paddingVertical: 10,
      paddingHorizontal: 20,
      borderRadius: 20,
      borderWidth: 2,
      borderColor: colors.border,
      backgroundColor: colors.surface,
    },
    radiusChipActive: {
      backgroundColor: colors.primary,
      borderColor: colors.primary,
    },
    radiusChipText: {
      fontSize: 15,
      fontWeight: "600",
      color: colors.text,
    },
    radiusChipTextActive: {
      color: colors.white,
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
