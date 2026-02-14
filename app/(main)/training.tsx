import { useState, useRef, useCallback, useEffect } from "react";
import {
  View,
  Text,
  Pressable,
  StyleSheet,
  Animated,
  PanResponder,
  useWindowDimensions,
  Platform,
} from "react-native";
import { useRouter } from "expo-router";
import { useTranslation } from "react-i18next";
import AsyncStorage from "@react-native-async-storage/async-storage";
import * as Haptics from "expo-haptics";
import ConfettiCannon from "react-native-confetti-cannon";
import { useTheme } from "@/contexts/ThemeContext";
import { useGrimoire } from "@/hooks/useGrimoire";
import { MogogoMascot } from "@/components/MogogoMascot";
import { TrainingCard } from "@/components/TrainingCard";
import { TRAINING_DECK } from "@/constants/trainingDeck";
import type { ThemeColors } from "@/constants";

const SWIPE_THRESHOLD = 80;
const FLYOUT_DURATION = 200;
const ROTATION_DEG = 12;
const NEXT_CARD_SCALE = 0.92;

function CompletionConfetti() {
  const [visible, setVisible] = useState(true);
  if (!visible) return null;
  return (
    <ConfettiCannon
      count={80}
      origin={{ x: -10, y: 0 }}
      autoStart
      fadeOut
      onAnimationEnd={() => setVisible(false)}
    />
  );
}

export default function TrainingScreen() {
  const { t } = useTranslation();
  const router = useRouter();
  const { colors } = useTheme();
  const { boostTags, penalizeTags } = useGrimoire();
  const { width: screenWidth } = useWindowDimensions();
  const s = getStyles(colors);

  const [currentIndex, setCurrentIndex] = useState(0);
  const [completed, setCompleted] = useState(false);

  const position = useRef(new Animated.ValueXY()).current;
  const nextScale = useRef(new Animated.Value(NEXT_CARD_SCALE)).current;
  const cardOpacity = useRef(new Animated.Value(1)).current;
  const indexRef = useRef(0);

  const hapticFeedback = useCallback(() => {
    if (Platform.OS !== "web") {
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    }
  }, []);

  const advanceCard = useCallback(
    (direction: "left" | "right") => {
      const card = TRAINING_DECK[indexRef.current];
      if (!card) return;

      hapticFeedback();

      const toX = direction === "right" ? screenWidth + 100 : -(screenWidth + 100);

      // Fire-and-forget grimoire update
      if (direction === "right") {
        boostTags(card.tags);
      } else {
        penalizeTags(card.tags);
      }

      Animated.parallel([
        Animated.timing(position, {
          toValue: { x: toX, y: 0 },
          duration: FLYOUT_DURATION,
          useNativeDriver: true,
        }),
        Animated.timing(nextScale, {
          toValue: 1,
          duration: FLYOUT_DURATION,
          useNativeDriver: true,
        }),
      ]).start(() => {
        const nextIndex = indexRef.current + 1;
        if (nextIndex >= TRAINING_DECK.length) {
          AsyncStorage.setItem("mogogo_training_completed", "true");
          setCompleted(true);
        } else {
          // 1. Hide card + reset position/scale on native thread (duration 0)
          // 2. Then trigger re-render → new card content mounted while invisible
          // 3. useEffect on currentIndex reveals the card after React commits
          indexRef.current = nextIndex;
          Animated.parallel([
            Animated.timing(cardOpacity, {
              toValue: 0,
              duration: 0,
              useNativeDriver: true,
            }),
            Animated.timing(position, {
              toValue: { x: 0, y: 0 },
              duration: 0,
              useNativeDriver: true,
            }),
            Animated.timing(nextScale, {
              toValue: NEXT_CARD_SCALE,
              duration: 0,
              useNativeDriver: true,
            }),
          ]).start(() => {
            setCurrentIndex(nextIndex);
          });
        }
      });
    },
    [screenWidth, position, nextScale, boostTags, penalizeTags, hapticFeedback],
  );

  const panResponder = useRef(
    PanResponder.create({
      onMoveShouldSetPanResponder: (_, gesture) =>
        Math.abs(gesture.dx) > 20 && Math.abs(gesture.dx) > Math.abs(gesture.dy * 2),
      onPanResponderMove: (_, gesture) => {
        position.setValue({ x: gesture.dx, y: gesture.dy });
      },
      onPanResponderRelease: (_, gesture) => {
        if (gesture.dx > SWIPE_THRESHOLD) {
          advanceCard("right");
        } else if (gesture.dx < -SWIPE_THRESHOLD) {
          advanceCard("left");
        } else {
          Animated.spring(position, {
            toValue: { x: 0, y: 0 },
            friction: 5,
            useNativeDriver: true,
          }).start();
        }
      },
    }),
  ).current;

  // Reveal new card after React commits the re-render
  useEffect(() => {
    Animated.timing(cardOpacity, {
      toValue: 1,
      duration: 0,
      useNativeDriver: true,
    }).start();
  }, [currentIndex]);

  // Interpolations
  const rotate = position.x.interpolate({
    inputRange: [-screenWidth, 0, screenWidth],
    outputRange: [`-${ROTATION_DEG}deg`, "0deg", `${ROTATION_DEG}deg`],
    extrapolate: "clamp",
  });

  const likeOpacity = position.x.interpolate({
    inputRange: [0, SWIPE_THRESHOLD],
    outputRange: [0, 1],
    extrapolate: "clamp",
  });

  const dislikeOpacity = position.x.interpolate({
    inputRange: [-SWIPE_THRESHOLD, 0],
    outputRange: [1, 0],
    extrapolate: "clamp",
  });

  const progressPercent = completed
    ? 100
    : (currentIndex / TRAINING_DECK.length) * 100;

  if (completed) {
    return (
      <View style={[s.screen, { paddingVertical: 24 }]}>
        <CompletionConfetti />
        <View style={s.completionContent}>
          <MogogoMascot message={t("training.completionMessage")} />
          <Text style={s.completionHint}>{t("training.completionHint")}</Text>
          <Pressable
            style={s.primaryButton}
            onPress={() => router.back()}
          >
            <Text style={s.primaryButtonText}>{t("training.letsGo")}</Text>
          </Pressable>
        </View>
      </View>
    );
  }

  const currentCard = TRAINING_DECK[currentIndex];
  const nextCard = currentIndex + 1 < TRAINING_DECK.length ? TRAINING_DECK[currentIndex + 1] : null;

  return (
    <View style={[s.screen, { paddingVertical: 16 }]}>
      {/* Mogogo instruction */}
      <MogogoMascot message={t("training.mogogoInstruction")} />

      {/* Progress */}
      <View style={s.progressContainer}>
        <Text style={s.progressText}>
          {currentIndex + 1}/{TRAINING_DECK.length}
        </Text>
        <View style={s.progressBarBg}>
          <View style={[s.progressBarFill, { width: `${progressPercent}%` }]} />
        </View>
      </View>

      {/* Card stack */}
      <View style={s.cardContainer}>
        {/* Next card (behind) */}
        {nextCard && (
          <Animated.View
            style={[
              s.cardWrapper,
              { transform: [{ scale: nextScale }] },
            ]}
          >
            <TrainingCard card={nextCard} />
          </Animated.View>
        )}

        {/* Current card (top) */}
        <Animated.View
          {...panResponder.panHandlers}
          style={[
            s.cardWrapper,
            {
              opacity: cardOpacity,
              transform: [
                { translateX: position.x },
                { translateY: position.y },
                { rotate },
              ],
            },
          ]}
        >
          {/* Like overlay */}
          <Animated.View style={[s.overlayLike, { opacity: likeOpacity }]}>
            <Text style={s.overlayText}>{"\u2764\uFE0F"}</Text>
          </Animated.View>

          {/* Dislike overlay */}
          <Animated.View style={[s.overlayDislike, { opacity: dislikeOpacity }]}>
            <Text style={s.overlayText}>{"\u2717"}</Text>
          </Animated.View>

          <TrainingCard card={currentCard} />
        </Animated.View>
      </View>

      {/* Skip button */}
      <Pressable style={s.skipButton} onPress={() => router.back()}>
        <Text style={s.skipText}>{t("training.skip")}</Text>
      </Pressable>
    </View>
  );
}

const getStyles = (colors: ThemeColors) =>
  StyleSheet.create({
    screen: {
      flex: 1,
      backgroundColor: colors.background,
      paddingHorizontal: 24,
    },

    /* Progress */
    progressContainer: {
      alignItems: "center",
      marginBottom: 16,
    },
    progressText: {
      fontSize: 15,
      fontWeight: "600",
      color: colors.textSecondary,
      marginBottom: 8,
    },
    progressBarBg: {
      width: "100%",
      height: 6,
      borderRadius: 3,
      backgroundColor: colors.border,
      overflow: "hidden",
    },
    progressBarFill: {
      height: "100%",
      borderRadius: 3,
      backgroundColor: colors.primary,
    },

    /* Card stack */
    cardContainer: {
      flex: 1,
      justifyContent: "center",
      alignItems: "center",
    },
    cardWrapper: {
      position: "absolute",
      width: "100%",
    },

    /* Overlays */
    overlayLike: {
      position: "absolute",
      top: 20,
      left: 20,
      zIndex: 10,
      backgroundColor: "rgba(76, 175, 80, 0.85)",
      borderRadius: 12,
      padding: 8,
    },
    overlayDislike: {
      position: "absolute",
      top: 20,
      right: 20,
      zIndex: 10,
      backgroundColor: "rgba(244, 67, 54, 0.85)",
      borderRadius: 12,
      padding: 8,
    },
    overlayText: {
      fontSize: 28,
      color: colors.white,
    },

    /* Skip */
    skipButton: {
      alignItems: "center",
      paddingVertical: 14,
    },
    skipText: {
      fontSize: 15,
      color: colors.textSecondary,
      fontWeight: "500",
    },

    /* Completion */
    completionContent: {
      flex: 1,
      justifyContent: "center",
      alignItems: "center",
    },
    completionHint: {
      fontSize: 14,
      color: colors.textSecondary,
      textAlign: "center",
      marginTop: 16,
      marginBottom: 24,
      paddingHorizontal: 16,
      lineHeight: 20,
    },
    primaryButton: {
      backgroundColor: colors.primary,
      borderRadius: 12,
      paddingVertical: 16,
      paddingHorizontal: 40,
      alignItems: "center",
    },
    primaryButtonText: {
      color: colors.white,
      fontSize: 18,
      fontWeight: "700",
    },
  });
