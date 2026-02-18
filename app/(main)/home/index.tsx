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
  Alert,
} from "react-native";
import { useRouter } from "expo-router";
import { useState, useRef, useCallback, useEffect } from "react";
import { useTranslation } from "react-i18next";
import { Ionicons } from "@expo/vector-icons";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { useFunnel } from "@/contexts/FunnelContext";
import * as ExpoLocation from "expo-location";
import { useLocation, checkLocationPermission, requestLocationPermission } from "@/hooks/useLocation";
import { useTheme } from "@/contexts/ThemeContext";
import { getCurrentLanguage } from "@/i18n";
import { MogogoMascot } from "@/components/MogogoMascot";
import AgeRangeSlider from "@/components/AgeRangeSlider";
import { DailyRewardBanner } from "@/components/DailyRewardBanner";
import { ResolutionToggle } from "@/components/ResolutionToggle";
import { TAG_CATALOG } from "@/constants/tags";
import {
  SOCIAL_KEYS,
  SOCIAL_I18N,
  ENVIRONMENT_KEYS,
  ENVIRONMENT_I18N,
} from "@/i18n/contextKeys";
import type { UserContextV3 } from "@/types";
import type { ThemeColors } from "@/constants";
import type { SocialKey, EnvironmentKey } from "@/i18n/contextKeys";

const SLIDE_DURATION = 250;

const ALL_TAG_SLUGS = Object.keys(TAG_CATALOG);

const SOCIAL_ICONS: Record<SocialKey, string> = {
  solo: "\u{1F9D1}",
  friends: "\u{1F46B}",
  couple: "\u{1F491}",
  family: "\u{1F46A}",
};

const ENVIRONMENT_ICONS: Record<EnvironmentKey, string> = {
  env_home: "\u{1F3E0}",
  env_shelter: "\u{2602}\u{FE0F}",
  env_open_air: "\u{2600}\u{FE0F}",
};

/* ─── Step Indicators (numbered circles with connecting lines) ─── */
function StepIndicators({
  current,
  total,
  colors,
}: {
  current: number;
  total: number;
  colors: ThemeColors;
}) {
  return (
    <View style={stepStyles.row}>
      {Array.from({ length: total }, (_, i) => {
        const isActive = i === current;
        const isCompleted = i < current;
        return (
          <View key={i} style={stepStyles.item}>
            <View
              style={[
                stepStyles.circle,
                isActive && stepStyles.circleActive,
                isCompleted && stepStyles.circleCompleted,
                !isActive && !isCompleted && { borderColor: colors.border, backgroundColor: colors.surface },
              ]}
            >
              <Text
                style={[
                  stepStyles.circleText,
                  (isActive || isCompleted) ? { color: colors.white } : { color: colors.textSecondary },
                ]}
              >
                {i + 1}
              </Text>
            </View>
            {i < total - 1 && (
              <View
                style={[
                  stepStyles.line,
                  { backgroundColor: isCompleted ? colors.primary : colors.border },
                ]}
              />
            )}
          </View>
        );
      })}
    </View>
  );
}

const stepStyles = StyleSheet.create({
  row: {
    flexDirection: "row",
    justifyContent: "center",
    alignItems: "center",
    marginBottom: 4,
  },
  item: {
    flexDirection: "row",
    alignItems: "center",
  },
  circle: {
    width: 32,
    height: 32,
    borderRadius: 16,
    borderWidth: 2,
    borderColor: "#8B5CF6",
    justifyContent: "center",
    alignItems: "center",
  },
  circleActive: {
    backgroundColor: "#8B5CF6",
    borderColor: "#A78BFA",
  },
  circleCompleted: {
    backgroundColor: "#8B5CF6",
    borderColor: "#8B5CF6",
  },
  circleText: {
    fontSize: 13,
    fontWeight: "600",
  },
  line: {
    width: 40,
    height: 2,
    borderRadius: 1,
  },
});

export default function ContextScreen() {
  const router = useRouter();
  const { t } = useTranslation();
  const { setContext } = useFunnel();
  const { location, refreshLocation } = useLocation();
  const { colors } = useTheme();
  const { width: screenWidth } = useWindowDimensions();
  const s = getStyles(colors);

  const [step, setStep] = useState(0);
  const [social, setSocial] = useState<string>("solo");
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
  // Resolution mode state
  const [resolutionMode, setResolutionMode] = useState(false);
  // Location permission modal
  const [showLocationModal, setShowLocationModal] = useState(false);
  const [pendingEnvKey, setPendingEnvKey] = useState<EnvironmentKey | null>(null);

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

  // Scale anims for environment cards
  const envScales = useRef(
    ENVIRONMENT_KEYS.reduce(
      (acc, key) => ({ ...acc, [key]: new Animated.Value(1) }),
      {} as Record<EnvironmentKey, Animated.Value>,
    ),
  ).current;

  const TOTAL_STEPS = 3;

  const isValid = social && environment;
  const canStart = !!isValid;

  const handleStart = async () => {
    const wantsLocationBased = environment !== "env_home" && resolutionMode;

    // Si l'utilisateur veut LOCATION_BASED mais qu'on n'a pas de position GPS,
    // tenter de l'obtenir (permission + refresh) avant de continuer.
    let resolvedLocation = location;
    if (wantsLocationBased && !location) {
      const granted = await requestLocationPermission();
      if (granted) {
        try {
          const pos = await ExpoLocation.getCurrentPositionAsync({
            accuracy: ExpoLocation.Accuracy.Balanced,
          });
          resolvedLocation = { latitude: pos.coords.latitude, longitude: pos.coords.longitude };
        } catch {
          resolvedLocation = null;
        }
      }

      if (!resolvedLocation) {
        Alert.alert(
          t("context.gpsErrorTitle"),
          t("context.gpsErrorMessage"),
        );
        return;
      }
    }

    const ctx: UserContextV3 = {
      social,
      environment,
      language: getCurrentLanguage(),
      ...(resolvedLocation && { location: resolvedLocation }),
      ...(social === "family" && { children_ages: childrenAges }),
      ...(q0Mode === "have_idea" && userHint.trim() && { user_hint: userHint.trim() }),
      ...(!(q0Mode === "have_idea" && userHint.trim()) && q0Mode === "have_idea" && userHintTags.length > 0 && { user_hint_tags: userHintTags }),
      ...(environment !== "env_home" && { search_radius: searchRadius }),
      resolution_mode: (wantsLocationBased && resolvedLocation) ? "LOCATION_BASED" as const : "INSPIRATION" as const,
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

  const handleEnvSelect = async (key: EnvironmentKey) => {
    if (key === "env_home") {
      setResolutionMode(false);
      setEnvironment(key);
      pulseScale(envScales[key]);
      return;
    }

    // Shelter ou outdoor → vérifier la permission localisation
    const granted = await checkLocationPermission();
    if (granted) {
      setEnvironment(key);
      pulseScale(envScales[key]);
      return;
    }

    // Pas de permission → modale Mogogo
    setPendingEnvKey(key);
    setShowLocationModal(true);
  };

  const handleLocationModalOk = async () => {
    setShowLocationModal(false);
    const granted = await requestLocationPermission();
    if (granted) {
      refreshLocation();
      if (pendingEnvKey) {
        setEnvironment(pendingEnvKey);
        pulseScale(envScales[pendingEnvKey]);
      }
    } else {
      // Permission refusée → fallback env_home
      setEnvironment("env_home");
      pulseScale(envScales["env_home"]);
    }
    setPendingEnvKey(null);
  };

  const handleLocationModalCancel = () => {
    setShowLocationModal(false);
    setPendingEnvKey(null);
    // Rester sur l'env sélectionné précédemment (pas de changement)
  };

  const toggleHintTag = (slug: string) => {
    setUserHintTags((prev) => prev.includes(slug) ? [] : [slug]);
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
        <>
          <ResolutionToggle
            value={resolutionMode}
            onValueChange={setResolutionMode}
          />
          {resolutionMode && (
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
        </>
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
            onChangeText={(text) => {
              setUserHint(text);
              if (text.trim().length > 0 && userHintTags.length > 0) setUserHintTags([]);
            }}
            placeholder={t("context.q0.hintPlaceholder")}
            placeholderTextColor={colors.textSecondary}
            multiline
            maxLength={200}
          />
          <Text style={s.q0TagsTitle}>{t("context.q0.tagsTitle")}</Text>
          <View style={s.q0TagsGrid}>
            {(() => { const hintHasText = userHint.trim().length > 0; return ALL_TAG_SLUGS.map((slug) => {
              const tag = TAG_CATALOG[slug];
              const isActive = userHintTags.includes(slug);
              return (
                <Pressable
                  key={slug}
                  style={[s.q0TagChip, isActive && s.q0TagChipActive, hintHasText && { opacity: 0.4 }]}
                  onPress={hintHasText ? undefined : () => toggleHintTag(slug)}
                >
                  <Text style={s.q0TagEmoji}>{tag.emoji}</Text>
                  <Text style={[s.q0TagLabel, isActive && s.q0TagLabelActive]}>
                    {t(tag.labelKey)}
                  </Text>
                </Pressable>
              );
            }); })()}
          </View>
        </View>
      )}
    </View>
  );

  const steps = [
    renderEnvironmentStep,
    renderSocialStep,
    renderQ0Step,
  ];

  return (
    <View style={s.screen}>
      {/* ─── Daily reward banner ─── */}
      <DailyRewardBanner />

      {/* ─── Header: progress dots ─── */}
      <View style={s.header}>
        <StepIndicators current={step} total={TOTAL_STEPS} colors={colors} />
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
            style={s.footerBack}
            onPress={() => router.push("/(main)/grimoire")}
          >
            <Ionicons name="book-outline" size={18} color={colors.primary} />
            <Text style={s.footerBackText}>{t("grimoire.openGrimoire")}</Text>
          </Pressable>
        ) : (
          <Pressable style={s.footerBack} onPress={goBack}>
            <Ionicons name="arrow-back" size={18} color={colors.textSecondary} />
            <Text style={s.footerBackText}>{t("common.back")}</Text>
          </Pressable>
        )}

        {step < TOTAL_STEPS - 1 ? (
          <Pressable style={s.footerNext} onPress={goNext}>
            <Text style={s.footerNextText}>{t("context.wizard.next")}</Text>
            <Ionicons name="arrow-forward" size={18} color={colors.white} />
          </Pressable>
        ) : (
          <Pressable
            style={[s.footerNext, !canStart && s.footerButtonDisabled]}
            onPress={handleStart}
            disabled={!canStart}
          >
            <Text style={s.footerNextText}>{t("context.letsGo")}</Text>
            <Ionicons name="rocket" size={18} color={colors.white} />
          </Pressable>
        )}
      </View>

      {/* Location permission modal */}
      <Modal
        visible={showLocationModal}
        transparent
        animationType="fade"
        onRequestClose={handleLocationModalCancel}
      >
        <Pressable style={s.modalOverlay} onPress={handleLocationModalCancel}>
          <View style={s.modalContent} onStartShouldSetResponder={() => true}>
            <MogogoMascot message={t("permissions.locationModalMessage")} />
            <Pressable style={s.modalPrimaryButton} onPress={handleLocationModalOk}>
              <Text style={s.modalPrimaryText}>{t("permissions.locationModalOk")}</Text>
            </Pressable>
            <Pressable style={s.modalSecondaryButton} onPress={handleLocationModalCancel}>
              <Text style={s.modalSecondaryText}>{t("permissions.locationModalCancel")}</Text>
            </Pressable>
          </View>
        </Pressable>
      </Modal>

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
      backgroundColor: "transparent",
    },

    /* ─── Header ─── */
    header: {
      alignItems: "center",
      marginTop: 12,
      marginBottom: 4,
      paddingHorizontal: 24,
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
      paddingHorizontal: 24,
    },
    stepTitle: {
      fontSize: 22,
      fontWeight: "700",
      color: colors.text,
      textAlign: "center",
      marginBottom: 24,
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
      borderWidth: 1,
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
      fontSize: 36,
      marginBottom: 8,
    },
    socialLabel: {
      fontSize: 15,
      fontWeight: "600",
      color: colors.text,
    },
    socialLabelActive: {
      color: colors.white,
    },

    /* ─── Environment step (3 cards row) ─── */
    envRow: {
      flexDirection: "row",
      justifyContent: "center",
      gap: 10,
    },
    envCard: {
      flex: 1,
      borderRadius: 16,
      borderWidth: 1,
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
      paddingVertical: 22,
    },
    envIcon: {
      fontSize: 36,
      marginBottom: 8,
    },
    envLabel: {
      fontSize: 13,
      fontWeight: "600",
      color: colors.text,
      textAlign: "center" as const,
    },
    envLabelActive: {
      color: colors.white,
    },

    /* ─── Q0 step ─── */
    q0Card: {
      width: "46%",
      borderRadius: 16,
      borderWidth: 1,
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
      gap: 10,
    },
    q0TagChip: {
      width: "47%" as any,
      flexDirection: "row",
      alignItems: "center",
      gap: 8,
      paddingHorizontal: 14,
      paddingVertical: 12,
      borderRadius: 14,
      borderWidth: 1,
      borderColor: colors.border,
      backgroundColor: colors.surface,
    },
    q0TagChipActive: {
      backgroundColor: colors.primary,
      borderColor: colors.primary,
    },
    q0TagEmoji: {
      fontSize: 16,
    },
    q0TagLabel: {
      fontSize: 14,
      color: colors.text,
    },
    q0TagLabelActive: {
      color: colors.white,
      fontWeight: "600",
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
      gap: 10,
    },
    radiusChip: {
      paddingVertical: 10,
      paddingHorizontal: 20,
      borderRadius: 20,
      borderWidth: 1,
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
      paddingVertical: 12,
      paddingHorizontal: 16,
    },
    footerBackText: {
      fontSize: 15,
      color: colors.textSecondary,
    },
    footerNext: {
      flexDirection: "row",
      alignItems: "center",
      gap: 6,
      backgroundColor: colors.primary,
      paddingVertical: 12,
      paddingHorizontal: 24,
      borderRadius: 12,
    },
    footerNextText: {
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
      backgroundColor: colors.background,
      justifyContent: "center",
      alignItems: "center",
      padding: 32,
    },
    modalContent: {
      backgroundColor: colors.surface,
      borderRadius: 20,
      padding: 24,
      width: "100%",
      maxWidth: 340,
      alignItems: "center",
      borderWidth: 1,
      borderColor: colors.border,
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
