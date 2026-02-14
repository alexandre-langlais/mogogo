import { Modal, View, Text, StyleSheet } from "react-native";
import { useTranslation } from "react-i18next";
import { MogogoMascot } from "@/components/MogogoMascot";
import { ChoiceButton } from "@/components/ChoiceButton";
import { useTheme } from "@/contexts/ThemeContext";
import type { ThemeColors } from "@/constants";

interface AdConsentModalProps {
  visible: boolean;
  adNotWatched?: boolean;
  onWatchAd: () => void;
  onGoPremium: () => void;
}

export function AdConsentModal({ visible, adNotWatched, onWatchAd, onGoPremium }: AdConsentModalProps) {
  const { t } = useTranslation();
  const { colors } = useTheme();
  const s = getStyles(colors);

  return (
    <Modal visible={visible} transparent animationType="fade" statusBarTranslucent>
      <View style={s.overlay}>
        <View style={s.card}>
          <MogogoMascot message={t("plumes.gateTitle")} />

          <Text style={s.message}>{t("plumes.gateMessage")}</Text>

          {adNotWatched && (
            <Text style={s.notWatchedMessage}>{t("funnel.adModalNotWatched")}</Text>
          )}

          <View style={s.buttons}>
            <ChoiceButton
              label={t("funnel.adModalWatch")}
              icon="\uD83C\uDFAC"
              onPress={onWatchAd}
            />
            <ChoiceButton
              label={t("funnel.adModalPremium")}
              icon="\uD83D\uDC51"
              variant="secondary"
              onPress={onGoPremium}
            />
          </View>
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
    notWatchedMessage: {
      fontSize: 14,
      color: "#D32F2F",
      textAlign: "center",
      lineHeight: 20,
      marginBottom: 16,
      fontWeight: "500",
    },
    buttons: {
      width: "100%",
      gap: 12,
    },
  });
