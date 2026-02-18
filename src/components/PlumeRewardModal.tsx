import { useRef, useEffect } from "react";
import { Modal, View, Text, StyleSheet, Animated, Platform } from "react-native";
import { Image } from "expo-image";
import * as Haptics from "expo-haptics";
import ConfettiCannon from "react-native-confetti-cannon";
import { useTranslation } from "react-i18next";
import { ChoiceButton } from "./ChoiceButton";
import { usePlumes } from "@/contexts/PlumesContext";
import { useTheme } from "@/contexts/ThemeContext";
import type { ThemeColors } from "@/constants";

const CONFETTI_COLORS = ["#FFD700", "#FFCA28", "#6C3FC5", "#9B7ADB", "#FF6B6B"];

export function PlumeRewardModal() {
  const { t } = useTranslation();
  const { colors } = useTheme();
  const s = getStyles(colors);
  const { rewardPending, setRewardPending } = usePlumes();
  const visible = rewardPending !== null;

  const overlayOpacity = useRef(new Animated.Value(0)).current;
  const cardScale = useRef(new Animated.Value(0.8)).current;
  const mascotBounce = useRef(new Animated.Value(1)).current;
  const counterScale = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    if (!visible) {
      overlayOpacity.setValue(0);
      cardScale.setValue(0.8);
      mascotBounce.setValue(1);
      counterScale.setValue(0);
      return;
    }

    // Haptic feedback
    if (Platform.OS !== "web") {
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    }

    // Fade overlay
    Animated.timing(overlayOpacity, {
      toValue: 1,
      duration: 300,
      useNativeDriver: true,
    }).start();

    // Spring scale card
    Animated.spring(cardScale, {
      toValue: 1,
      friction: 6,
      useNativeDriver: true,
    }).start();

    // Bounce mascotte (retardé 200ms)
    setTimeout(() => {
      Animated.sequence([
        Animated.timing(mascotBounce, {
          toValue: 1.15,
          duration: 200,
          useNativeDriver: true,
        }),
        Animated.timing(mascotBounce, {
          toValue: 1,
          duration: 200,
          useNativeDriver: true,
        }),
      ]).start();
    }, 200);

    // Pop compteur (retardé 400ms)
    setTimeout(() => {
      Animated.spring(counterScale, {
        toValue: 1,
        friction: 5,
        useNativeDriver: true,
      }).start();
    }, 400);
  }, [visible]);

  if (!visible) return null;

  const isAd = rewardPending.type === "ad";
  const titleKey = isAd ? "plumes.rewardTitleAd" : "plumes.rewardTitlePurchase";
  const messageKey = isAd ? "plumes.rewardMessageAd" : "plumes.rewardMessagePurchase";

  return (
    <Modal visible transparent animationType="none" statusBarTranslucent>
      <Animated.View style={[s.overlay, { opacity: overlayOpacity }]}>
        <Animated.View style={[s.card, { transform: [{ scale: cardScale }] }]}>
          {/* Emojis décoratifs */}
          <Text style={s.decoTopLeft}>✨</Text>
          <Text style={s.decoTopRight}>🌟</Text>
          <Text style={s.decoBottomRight}>🪶</Text>

          {/* Mascotte animée */}
          <Animated.View style={{ transform: [{ scale: mascotBounce }] }}>
            <Image
              source={require("../../assets/animations/validation/mogogo-joy-1.webp")}
              style={s.mascot}
              contentFit="contain"
              autoplay
            />
          </Animated.View>

          {/* Compteur doré */}
          <Animated.View style={[s.counterContainer, { transform: [{ scale: counterScale }] }]}>
            <Text style={s.counterText}>+{rewardPending.amount}</Text>
            <Text style={s.counterLabel}>🪶</Text>
          </Animated.View>

          {/* Titre & message */}
          <Text style={s.title}>{t(titleKey)}</Text>
          <Text style={s.message}>{t(messageKey)}</Text>

          {/* Bouton fermer */}
          <View style={s.buttonWrapper}>
            <ChoiceButton
              label={t("plumes.rewardButton")}
              icon="🚀"
              onPress={() => setRewardPending(null)}
            />
          </View>

          {/* Confettis */}
          <ConfettiCannon
            count={60}
            origin={{ x: -10, y: 0 }}
            colors={CONFETTI_COLORS}
            fadeOut
            autoStart
          />
        </Animated.View>
      </Animated.View>
    </Modal>
  );
}

const getStyles = (colors: ThemeColors) =>
  StyleSheet.create({
    overlay: {
      flex: 1,
      backgroundColor: colors.background,
      justifyContent: "center",
      alignItems: "center",
      padding: 24,
    },
    card: {
      backgroundColor: colors.surface,
      borderRadius: 24,
      borderWidth: 2,
      borderColor: "#FFD700",
      padding: 28,
      width: "100%",
      maxWidth: 360,
      alignItems: "center",
      overflow: "hidden",
    },
    decoTopLeft: {
      position: "absolute",
      top: 12,
      left: 14,
      fontSize: 22,
    },
    decoTopRight: {
      position: "absolute",
      top: 12,
      right: 14,
      fontSize: 22,
    },
    decoBottomRight: {
      position: "absolute",
      bottom: 12,
      right: 14,
      fontSize: 22,
    },
    mascot: {
      width: 120,
      height: 120,
      marginBottom: 8,
    },
    counterContainer: {
      flexDirection: "row",
      alignItems: "center",
      marginBottom: 12,
    },
    counterText: {
      fontSize: 42,
      fontWeight: "900",
      color: "#FFD700",
    },
    counterLabel: {
      fontSize: 32,
      marginLeft: 6,
    },
    title: {
      fontSize: 20,
      fontWeight: "800",
      color: colors.text,
      textAlign: "center",
      marginBottom: 8,
    },
    message: {
      fontSize: 15,
      color: colors.textSecondary,
      textAlign: "center",
      marginBottom: 20,
      lineHeight: 21,
    },
    buttonWrapper: {
      width: "100%",
    },
  });
