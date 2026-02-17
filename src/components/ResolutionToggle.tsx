import { useState } from "react";
import { View, Text, Switch, Pressable, Modal, StyleSheet } from "react-native";
import { useTranslation } from "react-i18next";
import { usePlumes } from "@/contexts/PlumesContext";
import { useTheme } from "@/contexts/ThemeContext";
import { MogogoMascot } from "@/components/MogogoMascot";
import type { ThemeColors } from "@/constants";

interface ResolutionToggleProps {
  value: boolean;
  onValueChange: (enabled: boolean) => void;
}

export function ResolutionToggle({ value, onValueChange }: ResolutionToggleProps) {
  const { t } = useTranslation();
  const { isPremium, refresh: refreshPlumes } = usePlumes();
  const { colors } = useTheme();
  const s = getStyles(colors);
  const [showUpsell, setShowUpsell] = useState(false);

  const handleToggle = (enabled: boolean) => {
    if (enabled && !isPremium) {
      setShowUpsell(true);
      return;
    }
    onValueChange(enabled);
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
        <Switch
          value={value}
          onValueChange={handleToggle}
          trackColor={{ false: colors.border, true: colors.primary }}
          thumbColor={colors.white}
        />
      </View>

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
    </>
  );
}

const getStyles = (colors: ThemeColors) =>
  StyleSheet.create({
    container: {
      flexDirection: "row",
      alignItems: "center",
      justifyContent: "space-between",
      marginTop: 20,
      padding: 16,
      borderRadius: 16,
      borderWidth: 1,
      borderColor: colors.border,
      backgroundColor: colors.surface,
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
