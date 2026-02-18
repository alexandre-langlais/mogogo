import { useState } from "react";
import { Modal, View, Text, Pressable, TextInput, StyleSheet, ActivityIndicator } from "react-native";
import * as Haptics from "expo-haptics";
import { useTranslation } from "react-i18next";
import { MogogoMascot } from "./MogogoMascot";
import { submitFeedback, type FeedbackCategory } from "@/services/feedback";
import { useTheme } from "@/contexts/ThemeContext";
import type { ThemeColors } from "@/constants";

interface FeedbackModalProps {
  visible: boolean;
  onClose: () => void;
}

const CATEGORIES: { key: FeedbackCategory; emoji: string; labelKey: string }[] = [
  { key: "feature", emoji: "\u2728", labelKey: "feedback.categoryFeature" },
  { key: "bug", emoji: "\ud83d\udc1b", labelKey: "feedback.categoryBug" },
  { key: "other", emoji: "\ud83d\udce2", labelKey: "feedback.categoryOther" },
];

export function FeedbackModal({ visible, onClose }: FeedbackModalProps) {
  const { t } = useTranslation();
  const { colors } = useTheme();
  const s = getStyles(colors);

  const [category, setCategory] = useState<FeedbackCategory>("feature");
  const [message, setMessage] = useState("");
  const [sending, setSending] = useState(false);
  const [success, setSuccess] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleClose = () => {
    setCategory("feature");
    setMessage("");
    setSending(false);
    setSuccess(false);
    setError(null);
    onClose();
  };

  const handleSend = async () => {
    if (message.trim().length === 0) {
      setError(t("feedback.emptyMessage"));
      return;
    }

    setError(null);
    setSending(true);
    try {
      await submitFeedback({ category, message });
      setSuccess(true);
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    } catch {
      setError(t("feedback.errorMessage"));
    }
    setSending(false);
  };

  if (success) {
    return (
      <Modal visible={visible} transparent animationType="fade" statusBarTranslucent>
        <Pressable style={s.overlay} onPress={handleClose}>
          <Pressable style={s.card} onPress={() => {}}>
            <MogogoMascot message={t("feedback.successMessage")} />
            <Pressable style={s.sendButton} onPress={handleClose}>
              <Text style={s.sendButtonText}>OK</Text>
            </Pressable>
          </Pressable>
        </Pressable>
      </Modal>
    );
  }

  return (
    <Modal visible={visible} transparent animationType="fade" statusBarTranslucent>
      <Pressable style={s.overlay} onPress={handleClose}>
        <Pressable style={s.card} onPress={() => {}}>
          <Pressable style={s.closeButton} onPress={handleClose} hitSlop={8}>
            <Text style={s.closeButtonText}>{"\u2715"}</Text>
          </Pressable>

          <MogogoMascot message={t("feedback.modalTitle")} />

          <View style={s.chips}>
            {CATEGORIES.map((cat) => (
              <Pressable
                key={cat.key}
                style={[s.chip, category === cat.key && s.chipSelected]}
                onPress={() => setCategory(cat.key)}
              >
                <Text style={[s.chipText, category === cat.key && s.chipTextSelected]}>
                  {cat.emoji} {t(cat.labelKey)}
                </Text>
              </Pressable>
            ))}
          </View>

          <TextInput
            style={s.input}
            value={message}
            onChangeText={setMessage}
            placeholder={t("feedback.placeholder")}
            placeholderTextColor={colors.textSecondary}
            multiline
            maxLength={2000}
            textAlignVertical="top"
          />

          {error && <Text style={s.errorText}>{error}</Text>}

          <View style={s.buttons}>
            <Pressable
              style={[s.sendButton, sending && s.sendButtonDisabled]}
              onPress={handleSend}
              disabled={sending}
            >
              {sending ? (
                <ActivityIndicator size="small" color="#fff" />
              ) : (
                <Text style={s.sendButtonText}>{t("feedback.send")}</Text>
              )}
            </Pressable>
            <Pressable style={s.cancelButton} onPress={handleClose}>
              <Text style={s.cancelButtonText}>{t("feedback.cancel")}</Text>
            </Pressable>
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
    chips: {
      flexDirection: "row",
      gap: 8,
      marginBottom: 16,
    },
    chip: {
      paddingHorizontal: 14,
      paddingVertical: 10,
      borderRadius: 20,
      borderWidth: 1,
      borderColor: colors.border,
      backgroundColor: colors.surface,
    },
    chipSelected: {
      borderColor: colors.primary,
      backgroundColor: colors.primary + "20",
    },
    chipText: {
      fontSize: 14,
      color: colors.text,
    },
    chipTextSelected: {
      color: colors.primary,
      fontWeight: "600",
    },
    input: {
      width: "100%",
      minHeight: 100,
      maxHeight: 200,
      borderWidth: 1,
      borderColor: colors.border,
      borderRadius: 14,
      padding: 14,
      fontSize: 15,
      color: colors.text,
      backgroundColor: colors.surface,
      marginBottom: 12,
    },
    errorText: {
      fontSize: 13,
      color: "#D32F2F",
      marginBottom: 8,
      textAlign: "center",
    },
    buttons: {
      width: "100%",
      gap: 10,
    },
    sendButton: {
      backgroundColor: colors.primary,
      borderRadius: 14,
      paddingVertical: 14,
      alignItems: "center",
    },
    sendButtonDisabled: {
      opacity: 0.6,
    },
    sendButtonText: {
      fontSize: 16,
      fontWeight: "700",
      color: "#fff",
    },
    cancelButton: {
      paddingVertical: 10,
      alignItems: "center",
    },
    cancelButtonText: {
      fontSize: 14,
      color: colors.textSecondary,
    },
  });
