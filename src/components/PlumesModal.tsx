import { useState } from "react";
import { Modal, View, Text, Pressable, StyleSheet, Alert } from "react-native";
import { useTranslation } from "react-i18next";
import { MogogoMascot } from "./MogogoMascot";
import { ChoiceButton } from "./ChoiceButton";
import { usePlumes } from "@/contexts/PlumesContext";
import { loadRewarded, showRewarded } from "@/services/admob";
import { PLUMES } from "@/services/plumes";
import { useTheme } from "@/contexts/ThemeContext";
import type { ThemeColors } from "@/constants";

interface PlumesModalProps {
  visible: boolean;
  onClose: () => void;
}

export function PlumesModal({ visible, onClose }: PlumesModalProps) {
  const { t } = useTranslation();
  const { colors } = useTheme();
  const s = getStyles(colors);
  const { plumes, isPremium, creditAfterAd, refresh } = usePlumes();
  const [buying, setBuying] = useState(false);

  const handleWatchAd = async () => {
    onClose();
    try {
      const earned = await showRewarded();
      if (earned) {
        const ok = await creditAfterAd(PLUMES.AD_REWARD);
        if (ok) {
          Alert.alert("", t("plumes.purchaseSuccess", { count: PLUMES.AD_REWARD }));
        }
        await refresh();
      }
    } catch { /* silencieux */ }
    loadRewarded();
  };

  const handleBuyPack = async (productId: string, amount: number) => {
    if (buying) return;
    setBuying(true);
    onClose();
    try {
      const { buyPlumesPack } = await import("@/services/purchases");
      const purchased = await buyPlumesPack(productId);
      if (purchased) {
        const ok = await creditAfterAd(amount);
        if (ok) {
          Alert.alert("", t("plumes.purchaseSuccess", { count: amount }));
        }
        await refresh();
      }
    } catch {
      Alert.alert("", t("plumes.purchaseError"));
    }
    setBuying(false);
  };

  const handleGoPremium = async () => {
    onClose();
    const { presentPaywall } = await import("@/services/purchases");
    await presentPaywall();
  };

  if (isPremium) return null;

  return (
    <Modal visible={visible} transparent animationType="fade" statusBarTranslucent>
      <Pressable style={s.overlay} onPress={onClose}>
        <Pressable style={s.card} onPress={() => {}}>
          <MogogoMascot message={t("plumes.shopTitle")} />

          <Text style={s.balance}>
            {t("plumes.shopBalance", { count: plumes ?? 0 })}
          </Text>

          <View style={s.buttons}>
            <ChoiceButton
              label={t("plumes.shopWatchAd")}
              icon="\uD83C\uDFAC"
              onPress={handleWatchAd}
            />
            <ChoiceButton
              label={t("plumes.shopSmallBag")}
              icon="\uD83D\uDCE6"
              variant="secondary"
              onPress={() => handleBuyPack("mogogo_plumes_100", PLUMES.PACK_SMALL)}
            />
            <ChoiceButton
              label={t("plumes.shopBigChest")}
              icon="\uD83D\uDC8E"
              variant="secondary"
              onPress={() => handleBuyPack("mogogo_plumes_300", PLUMES.PACK_LARGE)}
            />
            <ChoiceButton
              label={t("plumes.shopPremium")}
              icon="\uD83D\uDC51"
              variant="secondary"
              onPress={handleGoPremium}
            />
          </View>
        </Pressable>
      </Pressable>
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
    balance: {
      fontSize: 17,
      fontWeight: "700",
      color: colors.text,
      textAlign: "center",
      marginBottom: 20,
    },
    buttons: {
      width: "100%",
      gap: 12,
    },
  });
