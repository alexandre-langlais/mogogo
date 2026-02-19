import { useState } from "react";
import { Pressable, StyleSheet, Text } from "react-native";
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
    <>
      <Pressable style={s.button} onPress={() => setVisible(true)}>
        <Text style={s.buttonText}>{t("feedback.openButton")}</Text>
      </Pressable>
      <FeedbackModal visible={visible} onClose={() => setVisible(false)} />
    </>
  );
}

const getStyles = (colors: ThemeColors) =>
  StyleSheet.create({
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
