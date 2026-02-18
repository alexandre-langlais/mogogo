import { useState, useEffect } from "react";
import { Modal, View, Text, Pressable, StyleSheet, Alert, ActivityIndicator } from "react-native";
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

interface PackItem {
  identifier: string;
  amount: number;
  priceString: string;
  pkg: any; // PurchasesPackage from RevenueCat
}

export function PlumesModal({ visible, onClose }: PlumesModalProps) {
  const { t } = useTranslation();
  const { colors } = useTheme();
  const s = getStyles(colors);
  const { plumes, isPremium, creditAfterAd, refresh, dailyRewardAvailable, dailyRewardCountdown, claimDaily, setRewardPending } = usePlumes();
  const [buying, setBuying] = useState(false);
  const [adReady, setAdReady] = useState(false);
  const [dailyClaimed, setDailyClaimed] = useState(false);
  const [packs, setPacks] = useState<PackItem[]>([]);
  const [loadingPacks, setLoadingPacks] = useState(false);

  // Vérifier / précharger la pub + fetch offerings à l'ouverture
  useEffect(() => {
    if (!visible) return;
    setDailyClaimed(false);

    // Précharger pub
    if (isRewardedLoaded()) {
      setAdReady(true);
    } else {
      setAdReady(false);
      loadRewarded().then(() => setAdReady(isRewardedLoaded()));
    }

    // Fetch offerings RevenueCat
    setLoadingPacks(true);
    import("@/services/purchases").then(({ getPlumesOfferings }) => {
      getPlumesOfferings().then((packages) => {
        const PACK_AMOUNTS: Record<string, number> = {
          "plumes_pack_100": 100,
          "plumes_pack_200": 200,
          "plumes_pack_500": 500,
          "plumes_pack_1000": 1000,
        };
        const items: PackItem[] = packages
          .filter((p: any) => PACK_AMOUNTS[p.product.identifier])
          .map((p: any) => ({
            identifier: p.product.identifier,
            amount: PACK_AMOUNTS[p.product.identifier],
            priceString: p.product.priceString,
            pkg: p,
          }))
          .sort((a: PackItem, b: PackItem) => a.amount - b.amount);
        setPacks(items);
        setLoadingPacks(false);
      });
    });
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
          setRewardPending({ amount: PLUMES.AD_REWARD, type: "ad" });
        }
        await refresh();
      }
    } catch { /* silencieux */ }
    loadRewarded();
  };

  const handleBuyPack = async (pack: PackItem) => {
    if (buying) return;
    setBuying(true);
    onClose();
    try {
      const { buyPlumesPack } = await import("@/services/purchases");
      const result = await buyPlumesPack(pack.pkg);
      if (result.success) {
        setRewardPending({ amount: result.amount, type: "purchase" });
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
          <Pressable style={s.closeButton} onPress={onClose} hitSlop={8}>
            <Text style={s.closeButtonText}>✕</Text>
          </Pressable>
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

            {/* Section packs de plumes */}
            <Text style={s.sectionTitle}>{t("plumes.shopPacksTitle")}</Text>

            {loadingPacks ? (
              <ActivityIndicator size="small" color={colors.primary} />
            ) : packs.length > 0 ? (
              <View style={s.packsGrid}>
                {packs.map((pack) => (
                  <Pressable
                    key={pack.identifier}
                    style={[s.packCard, buying && s.packCardDisabled]}
                    onPress={() => handleBuyPack(pack)}
                    disabled={buying}
                  >
                    <Text style={s.packAmount}>
                      {t("plumes.shopPack", { count: pack.amount })}
                    </Text>
                    <Text style={s.packPrice}>{pack.priceString}</Text>
                  </Pressable>
                ))}
              </View>
            ) : null}

            {/* Section abonnement */}
            <Text style={s.sectionTitle}>{t("plumes.shopSubscriptionTitle")}</Text>

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
      backgroundColor: colors.background,
      justifyContent: "center",
      alignItems: "center",
      padding: 24,
    },
    card: {
      position: "relative",
      backgroundColor: colors.surface,
      borderRadius: 20,
      borderWidth: 1,
      borderColor: colors.border,
      padding: 24,
      width: "100%",
      maxWidth: 400,
      alignItems: "center",
    },
    closeButton: {
      position: "absolute",
      top: 12,
      right: 12,
      width: 28,
      height: 28,
      borderRadius: 14,
      backgroundColor: colors.surface,
      alignItems: "center",
      justifyContent: "center",
      zIndex: 1,
    },
    closeButtonText: {
      fontSize: 15,
      fontWeight: "700",
      color: colors.textSecondary,
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
    sectionTitle: {
      fontSize: 15,
      fontWeight: "700",
      color: colors.textSecondary,
      textAlign: "center",
      marginTop: 8,
    },
    packsGrid: {
      flexDirection: "row",
      flexWrap: "wrap",
      justifyContent: "space-between",
      gap: 10,
    },
    packCard: {
      width: "48%",
      backgroundColor: colors.surface,
      borderWidth: 1,
      borderColor: colors.primary,
      borderRadius: 14,
      paddingVertical: 14,
      paddingHorizontal: 8,
      alignItems: "center",
    },
    packCardDisabled: {
      opacity: 0.5,
    },
    packAmount: {
      fontSize: 15,
      fontWeight: "700",
      color: colors.text,
      marginBottom: 4,
    },
    packPrice: {
      fontSize: 14,
      fontWeight: "600",
      color: colors.primary,
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
