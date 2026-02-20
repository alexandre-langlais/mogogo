import { useState } from "react";
import { View, Text, Switch, Pressable, Modal, StyleSheet, ActivityIndicator } from "react-native";
import { useTranslation } from "react-i18next";
import { usePlumes } from "@/contexts/PlumesContext";
import { useTheme } from "@/contexts/ThemeContext";
import { MogogoMascot } from "@/components/MogogoMascot";
import { callLLMGateway } from "@/services/llm";
import type { ThemeColors } from "@/constants";

interface ResolutionToggleProps {
  value: boolean;
  onValueChange: (enabled: boolean) => void;
  openNow?: boolean;
  onOpenNowChange?: (enabled: boolean) => void;
}

export function ResolutionToggle({ value, onValueChange, openNow, onOpenNowChange }: ResolutionToggleProps) {
  const { t, i18n } = useTranslation();
  const { isPremium, refresh: refreshPlumes } = usePlumes();
  const { colors } = useTheme();
  const s = getStyles(colors);
  const [showUpsell, setShowUpsell] = useState(false);
  const [showQuotaExhausted, setShowQuotaExhausted] = useState(false);
  const [quotaInfo, setQuotaInfo] = useState<{ used: number; limit: number; resetsAt: string | null } | null>(null);
  const [checking, setChecking] = useState(false);

  const formatResetDate = (isoDate: string): string => {
    try {
      const date = new Date(isoDate);
      const lang = i18n.language;
      const day = date.getDate();
      const month = date.toLocaleDateString(lang, { month: "long" });
      // Ordinal : "1er" en français/espagnol, "1st"/"2nd"/etc. en anglais
      if (lang.startsWith("fr") || lang.startsWith("es")) {
        return `${day === 1 ? "1er" : day} ${month}`;
      }
      // Anglais : ordinal suffix
      const suffix = day === 1 || day === 21 || day === 31 ? "st"
        : day === 2 || day === 22 ? "nd"
        : day === 3 || day === 23 ? "rd"
        : "th";
      // Capitaliser le mois en anglais
      return `${month} ${day}${suffix}`;
    } catch {
      return "";
    }
  };

  const handleToggle = async (enabled: boolean) => {
    if (!enabled) {
      onValueChange(false);
      return;
    }

    if (!isPremium) {
      setShowUpsell(true);
      return;
    }

    // Premium : vérifier le quota avant d'activer
    setChecking(true);
    try {
      const response = await callLLMGateway({
        context: { social: "", environment: "" },
        phase: "quota_check",
      });

      const data = response as any;
      if (data.allowed === false) {
        setQuotaInfo({
          used: data.scans_used ?? 0,
          limit: data.scans_limit ?? 0,
          resetsAt: data.resets_at ?? null,
        });
        setShowQuotaExhausted(true);
        setChecking(false);
        return;
      }
    } catch {
      // Fail-open : erreur réseau → on laisse passer
    }

    setChecking(false);
    onValueChange(true);
  };

  const handleGoPremium = async () => {
    const { presentPaywall } = await import("@/services/purchases");
    const purchased = await presentPaywall();
    if (purchased) {
      await refreshPlumes();
      onValueChange(true);
    }
    setShowUpsell(false);
  };

  return (
    <>
      <View style={s.container}>
        <View style={s.row}>
          <View style={s.textSection}>
            <Text style={s.label}>
              {"\uD83D\uDCCD"} {t("context.resolution.label")}
            </Text>
            <Text style={s.description}>{t("context.resolution.description")}</Text>
            {!isPremium && (
              <Text style={s.premiumBadge}>
                {"\uD83D\uDC51"} {t("context.resolution.premiumRequired")}
              </Text>
            )}
          </View>
          {checking ? (
            <ActivityIndicator size="small" color={colors.primary} />
          ) : (
            <Switch
              value={value}
              onValueChange={handleToggle}
              trackColor={{ false: colors.border, true: colors.primary }}
              thumbColor={colors.white}
            />
          )}
        </View>
        {value && onOpenNowChange && (
          <>
            <View style={s.separator} />
            <View style={s.row}>
              <View style={s.textSection}>
                <Text style={s.label}>{t("context.openNow.label")}</Text>
                <Text style={s.description}>{t("context.openNow.description")}</Text>
              </View>
              <Switch
                value={openNow ?? true}
                onValueChange={onOpenNowChange}
                trackColor={{ false: colors.border, true: colors.primary }}
                thumbColor={colors.white}
              />
            </View>
          </>
        )}
      </View>

      {/* Modal upsell premium */}
      <Modal
        visible={showUpsell}
        transparent
        animationType="fade"
        onRequestClose={() => setShowUpsell(false)}
      >
        <Pressable style={s.modalOverlay} onPress={() => setShowUpsell(false)}>
          <View style={s.modalContent} onStartShouldSetResponder={() => true}>
            <MogogoMascot message={t("context.resolution.upsellMessage")} />
            <Pressable style={s.modalPrimaryButton} onPress={handleGoPremium}>
              <Text style={s.modalPrimaryText}>
                {"\uD83D\uDC51"} {t("context.resolution.upsellButton")}
              </Text>
            </Pressable>
            <Pressable style={s.modalSecondaryButton} onPress={() => setShowUpsell(false)}>
              <Text style={s.modalSecondaryText}>{t("common.back")}</Text>
            </Pressable>
          </View>
        </Pressable>
      </Modal>

      {/* Modal quota épuisé */}
      <Modal
        visible={showQuotaExhausted}
        transparent
        animationType="fade"
        onRequestClose={() => setShowQuotaExhausted(false)}
      >
        <Pressable style={s.modalOverlay} onPress={() => setShowQuotaExhausted(false)}>
          <View style={s.modalContent} onStartShouldSetResponder={() => true}>
            <MogogoMascot message={
              t("context.resolution.quotaExhaustedMessage", {
                used: quotaInfo?.used ?? 0,
                limit: quotaInfo?.limit ?? 0,
              })
            } />
            {quotaInfo?.resetsAt && (
              <Text style={s.resetDate}>
                {t("context.resolution.quotaResetsAt", {
                  date: formatResetDate(quotaInfo.resetsAt),
                })}
              </Text>
            )}
            <Pressable style={s.modalSecondaryButton} onPress={() => setShowQuotaExhausted(false)}>
              <Text style={s.modalSecondaryText}>{t("common.back")}</Text>
            </Pressable>
          </View>
        </Pressable>
      </Modal>
    </>
  );
}

const getStyles = (colors: ThemeColors) =>
  StyleSheet.create({
    container: {
      marginTop: 20,
      padding: 16,
      borderRadius: 16,
      borderWidth: 1,
      borderColor: colors.border,
      backgroundColor: colors.surface,
    },
    row: {
      flexDirection: "row",
      alignItems: "center",
      justifyContent: "space-between",
    },
    separator: {
      height: 1,
      backgroundColor: colors.border,
      marginVertical: 12,
    },
    textSection: {
      flex: 1,
      marginRight: 12,
    },
    label: {
      fontSize: 15,
      fontWeight: "600",
      color: colors.text,
    },
    description: {
      fontSize: 13,
      color: colors.textSecondary,
      marginTop: 4,
    },
    premiumBadge: {
      fontSize: 12,
      color: colors.primary,
      fontWeight: "600",
      marginTop: 4,
    },
    resetDate: {
      fontSize: 14,
      color: colors.textSecondary,
      textAlign: "center",
      marginBottom: 12,
    },
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
      borderWidth: 1,
      borderColor: colors.border,
      padding: 24,
      width: "100%",
      maxWidth: 340,
      alignItems: "center",
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
    },
    modalSecondaryText: {
      color: colors.textSecondary,
      fontSize: 15,
      fontWeight: "500",
    },
  });
