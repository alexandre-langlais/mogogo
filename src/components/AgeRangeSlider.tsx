import { View, Text, StyleSheet } from "react-native";
import { RangeSlider } from "@react-native-assets/slider";
import { useTranslation } from "react-i18next";
import { useTheme } from "@/contexts/ThemeContext";
import type { ThemeColors } from "@/constants";

interface AgeRangeSliderProps {
  value: { min: number; max: number };
  onValueChange: (value: { min: number; max: number }) => void;
  min?: number;
  max?: number;
}

export default function AgeRangeSlider({
  value,
  onValueChange,
  min = 0,
  max = 16,
}: AgeRangeSliderProps) {
  const { t } = useTranslation();
  const { colors } = useTheme();
  const s = getStyles(colors);

  return (
    <View style={s.container}>
      <Text style={s.label}>{t("context.childrenAge")}</Text>
      <RangeSlider
        range={[value.min, value.max]}
        minimumValue={min}
        maximumValue={max}
        step={1}
        minimumRange={0}
        outboundColor={colors.border}
        inboundColor={colors.primary}
        thumbTintColor={colors.white}
        thumbStyle={s.thumb}
        trackHeight={6}
        onValueChange={(range) =>
          onValueChange({ min: range[0], max: range[1] })
        }
      />
      <Text style={s.rangeLabel}>
        {t("context.childrenAgeRange", { min: value.min, max: value.max })}
      </Text>
    </View>
  );
}

const getStyles = (colors: ThemeColors) =>
  StyleSheet.create({
    container: {
      marginTop: 20,
      paddingHorizontal: 14,
    },
    label: {
      fontSize: 15,
      fontWeight: "600",
      color: colors.text,
      textAlign: "center",
      marginBottom: 16,
    },
    thumb: {
      width: 28,
      height: 28,
      borderRadius: 14,
      borderWidth: 3,
      borderColor: colors.primary,
      backgroundColor: colors.white,
    },
    rangeLabel: {
      fontSize: 14,
      color: colors.textSecondary,
      textAlign: "center",
      marginTop: 8,
    },
  });
