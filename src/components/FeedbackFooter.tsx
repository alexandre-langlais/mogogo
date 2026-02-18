import { useState } from "react";
import { View, Text, Pressable, StyleSheet } from "react-native";
import { useTranslation } from "react-i18next";
import { FeedbackModal } from "./FeedbackModal";
import { useTheme } from "@/contexts/ThemeContext";
import type { ThemeColors } from "@/constants";

export function FeedbackFooter() {
  const { t } = useTranslation();
  const { colors } = useTheme();
  const s = getStyles(colors);
  const [visible, setVisible] = useState(false);

  return (
    <View style={s.container}>
      <Text style={s.sectionTitle}>{t("feedback.sectionTitle")}</Text>
      <Pressable style={s.button} onPress={() => setVisible(true)}>
        <Text style={s.buttonText}>{t("feedback.openButton")}</Text>
      </Pressable>
      <FeedbackModal visible={visible} onClose={() => setVisible(false)} />
    </View>
  );
}

const getStyles = (colors: ThemeColors) =>
  StyleSheet.create({
    container: {
      paddingHorizontal: 24,
      paddingTop: 16,
      paddingBottom: 24,
    },
    sectionTitle: {
      fontSize: 18,
      fontWeight: "600",
      marginBottom: 12,
      color: colors.text,
    },
    button: {
      backgroundColor: colors.primary,
      borderRadius: 14,
      paddingVertical: 14,
      alignItems: "center",
    },
    buttonText: {
      fontSize: 16,
      fontWeight: "700",
      color: "#fff",
    },
  });
