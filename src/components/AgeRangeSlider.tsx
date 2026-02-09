import { useRef, useCallback, useState } from "react";
import {
  View,
  Text,
  StyleSheet,
  PanResponder,
  Animated,
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

  const [trackWidth, setTrackWidth] = useState(0);
  const range = max - min;

  // Keep mutable refs for current values (PanResponder captures closures)
  const minRef = useRef(value.min);
  const maxRef = useRef(value.max);
  minRef.current = value.min;
  maxRef.current = value.max;

  const valueToX = useCallback(
    (v: number) => ((v - min) / range) * trackWidth,
    [min, range, trackWidth],
  );

  const xToValue = useCallback(
    (x: number) => {
      const clamped = Math.max(0, Math.min(x, trackWidth));
      return Math.round((clamped / trackWidth) * range + min);
    },
    [min, range, trackWidth],
  );

  const handleLayout = (e: LayoutChangeEvent) => {
    setTrackWidth(e.nativeEvent.layout.width);
  };

  // Accumulated offset for each thumb during gesture
  const minStartX = useRef(0);
  const maxStartX = useRef(0);

  const minPanResponder = useRef(
    PanResponder.create({
      onStartShouldSetPanResponder: () => true,
      onMoveShouldSetPanResponder: () => true,
      onPanResponderGrant: () => {
        minStartX.current = valueToX(minRef.current);
      },
      onPanResponderMove: (_e, gestureState) => {
        if (trackWidth === 0) return;
        const newX = minStartX.current + gestureState.dx;
        let newVal = xToValue(newX);
        if (newVal > maxRef.current) newVal = maxRef.current;
        if (newVal !== minRef.current) {
          onValueChange({ min: newVal, max: maxRef.current });
        }
      },
      onPanResponderRelease: () => {},
    }),
  );

  const maxPanResponder = useRef(
    PanResponder.create({
      onStartShouldSetPanResponder: () => true,
      onMoveShouldSetPanResponder: () => true,
      onPanResponderGrant: () => {
        maxStartX.current = valueToX(maxRef.current);
      },
      onPanResponderMove: (_e, gestureState) => {
        if (trackWidth === 0) return;
        const newX = maxStartX.current + gestureState.dx;
        let newVal = xToValue(newX);
        if (newVal < minRef.current) newVal = minRef.current;
        if (newVal !== maxRef.current) {
          onValueChange({ min: minRef.current, max: newVal });
        }
      },
      onPanResponderRelease: () => {},
    }),
  );

  // Recreate pan responders when trackWidth changes so closures update
  if (trackWidth > 0) {
    minPanResponder.current = PanResponder.create({
      onStartShouldSetPanResponder: () => true,
      onMoveShouldSetPanResponder: () => true,
      onPanResponderGrant: () => {
        minStartX.current = ((minRef.current - min) / range) * trackWidth;
      },
      onPanResponderMove: (_e, gs) => {
        const newX = minStartX.current + gs.dx;
        let newVal = Math.round(
          (Math.max(0, Math.min(newX, trackWidth)) / trackWidth) * range + min,
        );
        if (newVal > maxRef.current) newVal = maxRef.current;
        if (newVal !== minRef.current) {
          onValueChange({ min: newVal, max: maxRef.current });
        }
      },
      onPanResponderRelease: () => {},
    });

    maxPanResponder.current = PanResponder.create({
      onStartShouldSetPanResponder: () => true,
      onMoveShouldSetPanResponder: () => true,
      onPanResponderGrant: () => {
        maxStartX.current = ((maxRef.current - min) / range) * trackWidth;
      },
      onPanResponderMove: (_e, gs) => {
        const newX = maxStartX.current + gs.dx;
        let newVal = Math.round(
          (Math.max(0, Math.min(newX, trackWidth)) / trackWidth) * range + min,
        );
        if (newVal < minRef.current) newVal = minRef.current;
        if (newVal !== maxRef.current) {
          onValueChange({ min: minRef.current, max: newVal });
        }
      },
      onPanResponderRelease: () => {},
    });
  }

  const minX = trackWidth > 0 ? ((value.min - min) / range) * trackWidth : 0;
  const maxX = trackWidth > 0 ? ((value.max - min) / range) * trackWidth : 0;

  return (
    <View style={s.container}>
      <Text style={s.label}>{t("context.childrenAge")}</Text>
      <View style={s.sliderContainer}>
        {/* Track background */}
        <View style={s.track} onLayout={handleLayout}>
          {/* Active track */}
          {trackWidth > 0 && (
            <View
              style={[
                s.activeTrack,
                {
                  left: minX,
                  width: maxX - minX,
                  backgroundColor: colors.primary,
                },
              ]}
            />
          )}
        </View>

        {/* Min thumb */}
        {trackWidth > 0 && (
          <Animated.View
            style={[
              s.thumb,
              {
                left: minX - THUMB_SIZE / 2,
                borderColor: colors.primary,
              },
            ]}
            {...minPanResponder.current.panHandlers}
          >
            <Text style={s.thumbLabel}>{value.min}</Text>
          </Animated.View>
        )}

        {/* Max thumb */}
        {trackWidth > 0 && (
          <Animated.View
            style={[
              s.thumb,
              {
                left: maxX - THUMB_SIZE / 2,
                borderColor: colors.primary,
              },
            ]}
            {...maxPanResponder.current.panHandlers}
          >
            <Text style={s.thumbLabel}>{value.max}</Text>
          </Animated.View>
        )}
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
      top: (20 + THUMB_SIZE) / 2 - THUMB_SIZE / 2 + TRACK_HEIGHT / 2 - THUMB_SIZE / 2,
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
