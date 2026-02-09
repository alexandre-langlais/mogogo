import { useRef, useMemo } from "react";
import {
  View,
  Text,
  StyleSheet,
  PanResponder,
  LayoutChangeEvent,
  Platform,
} from "react-native";
import { useTranslation } from "react-i18next";
import { useTheme } from "@/contexts/ThemeContext";
import type { ThemeColors } from "@/constants";

interface AgeRangeSliderProps {
  value: { min: number; max: number };
  onValueChange: (value: { min: number; max: number }) => void;
  min?: number;
  max?: number;
}

const THUMB_SIZE = 28;
const TRACK_HEIGHT = 6;

export default function AgeRangeSlider({
  value,
  onValueChange,
  min = 0,
  max = 16,
}: AgeRangeSliderProps) {
  const { t } = useTranslation();
  const { colors } = useTheme();
  const s = getStyles(colors);

  const range = max - min;

  // All mutable state in refs so the single PanResponder never has stale closures
  const trackWidthRef = useRef(0);
  const minRef = useRef(value.min);
  const maxRef = useRef(value.max);
  const onChangeRef = useRef(onValueChange);
  const activeThumb = useRef<"min" | "max" | null>(null);

  // Sync refs on every render
  minRef.current = value.min;
  maxRef.current = value.max;
  onChangeRef.current = onValueChange;

  const xToValue = (x: number) => {
    const w = trackWidthRef.current;
    if (w === 0) return min;
    const clamped = Math.max(0, Math.min(x, w));
    return Math.round((clamped / w) * range + min);
  };

  const valueToX = (v: number) => {
    const w = trackWidthRef.current;
    return ((v - min) / range) * w;
  };

  // Single PanResponder on the whole track area — created once, uses refs
  const panResponder = useMemo(
    () =>
      PanResponder.create({
        onStartShouldSetPanResponder: () => true,
        onMoveShouldSetPanResponder: () => true,
        onStartShouldSetPanResponderCapture: () => true,
        onMoveShouldSetPanResponderCapture: () => true,
        onPanResponderGrant: (e) => {
          const w = trackWidthRef.current;
          if (w === 0) return;
          // Touch X relative to the track (account for THUMB_SIZE/2 padding)
          const touchX = e.nativeEvent.locationX - THUMB_SIZE / 2;
          const minX = valueToX(minRef.current);
          const maxX = valueToX(maxRef.current);
          const distToMin = Math.abs(touchX - minX);
          const distToMax = Math.abs(touchX - maxX);
          // Pick the closest thumb; tie-break: prefer min if touching left half
          activeThumb.current = distToMin <= distToMax ? "min" : "max";
        },
        onPanResponderMove: (e) => {
          if (!activeThumb.current) return;
          const w = trackWidthRef.current;
          if (w === 0) return;
          const touchX = e.nativeEvent.locationX - THUMB_SIZE / 2;
          const newVal = xToValue(touchX);
          if (activeThumb.current === "min") {
            const clamped = Math.min(newVal, maxRef.current);
            if (clamped !== minRef.current) {
              onChangeRef.current({ min: clamped, max: maxRef.current });
            }
          } else {
            const clamped = Math.max(newVal, minRef.current);
            if (clamped !== maxRef.current) {
              onChangeRef.current({ min: minRef.current, max: clamped });
            }
          }
        },
        onPanResponderRelease: () => {
          activeThumb.current = null;
        },
        onPanResponderTerminate: () => {
          activeThumb.current = null;
        },
      }),
    // Stable — all mutable state accessed via refs
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [],
  );

  const handleLayout = (e: LayoutChangeEvent) => {
    trackWidthRef.current = e.nativeEvent.layout.width - THUMB_SIZE;
  };

  const w = trackWidthRef.current;
  const minX = w > 0 ? valueToX(value.min) : 0;
  const maxX = w > 0 ? valueToX(value.max) : 0;

  return (
    <View style={s.container}>
      <Text style={s.label}>{t("context.childrenAge")}</Text>
      <View
        style={s.sliderContainer}
        onLayout={handleLayout}
        {...panResponder.panHandlers}
      >
        {/* Track background */}
        <View style={s.track}>
          {/* Active track */}
          <View
            style={[
              s.activeTrack,
              {
                left: minX + THUMB_SIZE / 2,
                width: Math.max(0, maxX - minX),
                backgroundColor: colors.primary,
              },
            ]}
          />
        </View>

        {/* Min thumb */}
        <View
          style={[
            s.thumb,
            {
              left: minX,
              borderColor: colors.primary,
            },
          ]}
        >
          <Text style={s.thumbLabel}>{value.min}</Text>
        </View>

        {/* Max thumb */}
        <View
          style={[
            s.thumb,
            {
              left: maxX,
              borderColor: colors.primary,
            },
          ]}
        >
          <Text style={s.thumbLabel}>{value.max}</Text>
        </View>
      </View>

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
      paddingHorizontal: 4,
    },
    label: {
      fontSize: 15,
      fontWeight: "600",
      color: colors.text,
      textAlign: "center",
      marginBottom: 16,
    },
    sliderContainer: {
      height: THUMB_SIZE + 20,
      justifyContent: "center",
      paddingHorizontal: THUMB_SIZE / 2,
      ...(Platform.OS === "web" ? { cursor: "pointer" as any } : {}),
    },
    track: {
      height: TRACK_HEIGHT,
      borderRadius: TRACK_HEIGHT / 2,
      backgroundColor: colors.border,
    },
    activeTrack: {
      position: "absolute",
      height: TRACK_HEIGHT,
      borderRadius: TRACK_HEIGHT / 2,
    },
    thumb: {
      position: "absolute",
      width: THUMB_SIZE,
      height: THUMB_SIZE,
      borderRadius: THUMB_SIZE / 2,
      backgroundColor: colors.white,
      borderWidth: 3,
      alignItems: "center",
      justifyContent: "center",
      top: (THUMB_SIZE + 20 - THUMB_SIZE) / 2,
      ...Platform.select({
        ios: {
          shadowColor: colors.black,
          shadowOffset: { width: 0, height: 2 },
          shadowOpacity: 0.2,
          shadowRadius: 3,
        },
        android: {
          elevation: 4,
        },
        web: {
          shadowColor: colors.black,
          shadowOffset: { width: 0, height: 2 },
          shadowOpacity: 0.2,
          shadowRadius: 3,
        },
      }),
    },
    thumbLabel: {
      fontSize: 11,
      fontWeight: "700",
      color: colors.text,
    },
    rangeLabel: {
      fontSize: 14,
      color: colors.textSecondary,
      textAlign: "center",
      marginTop: 8,
    },
  });
