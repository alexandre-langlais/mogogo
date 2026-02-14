import { useState, useEffect } from "react";
import { Modal, View, Text, Pressable, StyleSheet, Alert } from "react-native";
import { useTranslation } from "react-i18next";
import { MogogoMascot } from "./MogogoMascot";
import { ChoiceButton } from "./ChoiceButton";
import { usePlumes } from "@/contexts/PlumesContext";
import { loadRewarded, showRewarded, isRewardedLoaded } from "@/services/admob";
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
  const { plumes, isPremium, creditAfterAd, refresh, dailyRewardAvailable, dailyRewardCountdown, claimDaily } = usePlumes();
  const [buying, setBuying] = useState(false);
  const [adReady, setAdReady] = useState(false);
  const [dailyClaimed, setDailyClaimed] = useState(false);

  // Vérifier / précharger la pub à l'ouverture de la modale + reset daily claimed
  useEffect(() => {
    if (!visible) return;
    setDailyClaimed(false);
    if (isRewardedLoaded()) {
      setAdReady(true);
    } else {
      setAdReady(false);
      loadRewarded().then(() => setAdReady(isRewardedLoaded()));
    }
  }, [visible]);

  const handleClaimDaily = async () => {
    const ok = await claimDaily();
    if (ok) setDailyClaimed(true);
  };

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

          {dailyClaimed ? (
            <Text style={s.dailyClaimed}>{t("plumes.dailyClaimed")}</Text>
          ) : dailyRewardAvailable ? (
            <Pressable style={s.dailyBanner} onPress={handleClaimDaily}>
              <Text style={s.dailyAvailableText}>{t("plumes.dailyAvailable")}</Text>
              <View style={s.dailyClaimButton}>
                <Text style={s.dailyClaimButtonText}>{t("plumes.dailyClaim")}</Text>
              </View>
            </Pressable>
          ) : dailyRewardCountdown ? (
            <Text style={s.dailyCountdown}>
              {t("plumes.dailyCountdown", { time: dailyRewardCountdown })}
            </Text>
          ) : null}

          <View style={s.buttons}>
            <ChoiceButton
              label={adReady ? t("plumes.shopWatchAd") : t("plumes.shopAdLoading")}
              icon="🎬"
              onPress={handleWatchAd}
              disabled={!adReady}
            />
            <ChoiceButton
              label={t("plumes.shopSmallBag")}
              icon="📦"
              variant="secondary"
              onPress={() => handleBuyPack("mogogo_plumes_100", PLUMES.PACK_SMALL)}
            />
            <ChoiceButton
              label={t("plumes.shopBigChest")}
              icon="💎"
              variant="secondary"
              onPress={() => handleBuyPack("mogogo_plumes_300", PLUMES.PACK_LARGE)}
            />
            <ChoiceButton
              label={t("plumes.shopPremium")}
              icon="👑"
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
    dailyBanner: {
      backgroundColor: "#FFF3CD",
      borderWidth: 1,
      borderColor: "#FFCA28",
      borderRadius: 12,
      padding: 12,
      alignItems: "center",
      width: "100%",
      marginBottom: 16,
    },
    dailyAvailableText: {
      fontSize: 15,
      fontWeight: "600",
      color: "#6D4C00",
      marginBottom: 8,
    },
    dailyClaimButton: {
      backgroundColor: "#FFCA28",
      borderRadius: 8,
      paddingVertical: 8,
      paddingHorizontal: 16,
    },
    dailyClaimButtonText: {
      fontSize: 14,
      fontWeight: "700",
      color: "#4E3500",
    },
    dailyClaimed: {
      fontSize: 14,
      fontWeight: "600",
      color: "#2E7D32",
      marginBottom: 16,
    },
    dailyCountdown: {
      fontSize: 13,
      color: colors.textSecondary,
      marginBottom: 16,
    },
  });
