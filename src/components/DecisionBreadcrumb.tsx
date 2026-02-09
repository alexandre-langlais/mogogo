import React, { useRef, useEffect } from "react";
import {
  ScrollView,
  Pressable,
  Text,
  View,
  StyleSheet,
  LayoutAnimation,
  Platform,
  UIManager,
} from "react-native";
import { useTranslation } from "react-i18next";
import { useTheme } from "@/contexts/ThemeContext";
import type { ThemeColors } from "@/constants";

if (Platform.OS === "android" && UIManager.setLayoutAnimationEnabledExperimental) {
  UIManager.setLayoutAnimationEnabledExperimental(true);
}

interface BreadcrumbStep {
  index: number;
  label: string;
}

interface DecisionBreadcrumbProps {
  steps: BreadcrumbStep[];
  onStepPress: (index: number) => void;
  disabled?: boolean;
}

export function DecisionBreadcrumb({ steps, onStepPress, disabled }: DecisionBreadcrumbProps) {
  const scrollRef = useRef<ScrollView>(null);
  const { t } = useTranslation();
  const { colors } = useTheme();
  const s = getStyles(colors);
  const prevLength = useRef(steps.length);

  useEffect(() => {
    if (steps.length !== prevLength.current) {
      LayoutAnimation.easeInEaseOut();
      prevLength.current = steps.length;
    }
    if (steps.length > 0) {
      setTimeout(() => scrollRef.current?.scrollToEnd({ animated: true }), 50);
    }
  }, [steps.length]);

  if (steps.length === 0) return null;

  return (
    <ScrollView
      ref={scrollRef}
      horizontal
      showsHorizontalScrollIndicator={false}
      contentContainerStyle={s.container}
      style={s.scroll}
    >
      {steps.map((step, i) => (
        <React.Fragment key={step.index}>
          {i > 0 && <Text style={s.separator}>{"✦"}</Text>}
          <Pressable
            onPress={() => onStepPress(step.index)}
            disabled={disabled}
            accessibilityLabel={t("funnel.timeTravel")}
            accessibilityRole="button"
            style={({ pressed }) => [s.chip, pressed && !disabled && s.chipPressed]}
          >
            <Text style={s.chipText} numberOfLines={1}>
              {step.label}
            </Text>
          </Pressable>
        </React.Fragment>
      ))}
    </ScrollView>
  );
}

const getStyles = (colors: ThemeColors) =>
  StyleSheet.create({
    scroll: {
      maxHeight: 48,
      flexGrow: 0,
      marginBottom: 8,
    },
    container: {
      alignItems: "center",
      paddingHorizontal: 4,
      gap: 6,
    },
    chip: {
      backgroundColor: colors.surface,
      borderWidth: 1,
      borderColor: colors.primary + "66",
      borderRadius: 16,
      paddingHorizontal: 12,
      paddingVertical: 6,
    },
    chipPressed: {
      opacity: 0.6,
    },
    chipText: {
      color: colors.primary,
      fontSize: 13,
      fontWeight: "500",
      maxWidth: 120,
    },
    separator: {
      color: colors.textSecondary,
      fontSize: 12,
    },
  });
