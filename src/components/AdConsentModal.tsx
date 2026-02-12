import { useState, useEffect } from "react";
import { Modal, View, Text, Pressable, StyleSheet } from "react-native";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { useTranslation } from "react-i18next";
import { MogogoMascot } from "@/components/MogogoMascot";
import { ChoiceButton } from "@/components/ChoiceButton";
import { useTheme } from "@/contexts/ThemeContext";
import type { ThemeColors } from "@/constants";

const SKIP_AD_MODAL_KEY = "mogogo_skip_ad_modal";

interface AdConsentModalProps {
  visible: boolean;
  onWatchAd: () => void;
  onGoPremium: () => void;
}

export function AdConsentModal({ visible, onWatchAd, onGoPremium }: AdConsentModalProps) {
  const { t } = useTranslation();
  const { colors } = useTheme();
  const s = getStyles(colors);
  const [skipNext, setSkipNext] = useState(false);

  useEffect(() => {
    if (visible) setSkipNext(false);
  }, [visible]);

  const toggleSkip = () => {
    const next = !skipNext;
    setSkipNext(next);
    AsyncStorage.setItem(SKIP_AD_MODAL_KEY, next ? "true" : "false").catch(() => {});
  };

  return (
    <Modal visible={visible} transparent animationType="fade" statusBarTranslucent>
      <View style={s.overlay}>
        <View style={s.card}>
          <MogogoMascot message={t("funnel.adModalTitle")} />

          <Text style={s.message}>{t("funnel.adModalMessage")}</Text>

          <View style={s.buttons}>
            <ChoiceButton
              label={t("funnel.adModalWatch")}
              icon="🎬"
              onPress={onWatchAd}
            />
            <ChoiceButton
              label={t("funnel.adModalPremium")}
              icon="👑"
              variant="secondary"
              onPress={onGoPremium}
            />
          </View>

          <Pressable style={s.checkboxRow} onPress={toggleSkip}>
            <View style={[s.checkbox, skipNext && s.checkboxChecked]}>
              {skipNext && <Text style={s.checkmark}>✓</Text>}
            </View>
            <Text style={s.checkboxLabel}>{t("funnel.adModalSkipNext")}</Text>
          </Pressable>
        </View>
      </View>
    </Modal>
  );
}

const getStyles = (colors: ThemeColors) =>
  StyleSheet.create({
    overlay: {
      flex: 1,
      backgroundColor: "rgba(0,0,0,0.6)",
      justifyContent: "center",
      alignItems: "center",
      padding: 24,
    },
    card: {
      backgroundColor: colors.background,
      borderRadius: 20,
      padding: 24,
      width: "100%",
      maxWidth: 400,
      alignItems: "center",
    },
    message: {
      fontSize: 15,
      color: colors.textSecondary,
      textAlign: "center",
      lineHeight: 22,
      marginBottom: 24,
    },
    buttons: {
      width: "100%",
      gap: 12,
    },
    checkboxRow: {
      flexDirection: "row",
      alignItems: "center",
      marginTop: 20,
      paddingHorizontal: 4,
    },
    checkbox: {
      width: 22,
      height: 22,
      borderRadius: 4,
      borderWidth: 2,
      borderColor: colors.border,
      justifyContent: "center",
      alignItems: "center",
      marginRight: 10,
    },
    checkboxChecked: {
      backgroundColor: colors.primary,
      borderColor: colors.primary,
    },
    checkmark: {
      color: colors.white,
      fontSize: 14,
      fontWeight: "bold",
    },
    checkboxLabel: {
      fontSize: 13,
      color: colors.textSecondary,
      flex: 1,
    },
  });
