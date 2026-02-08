import { useEffect, useRef } from "react";
import { View, Text, Animated, StyleSheet } from "react-native";
import { useTheme } from "@/contexts/ThemeContext";
import type { ThemeColors } from "@/constants";

interface PlumeBadgeProps {
  plumes: number;
}

export function PlumeBadge({ plumes }: PlumeBadgeProps) {
  const { colors } = useTheme();
  const s = getStyles(colors);
  const scale = useRef(new Animated.Value(1)).current;
  const prevPlumes = useRef(plumes);

  useEffect(() => {
    if (prevPlumes.current !== plumes) {
      prevPlumes.current = plumes;
      Animated.sequence([
        Animated.timing(scale, {
          toValue: 1.3,
          duration: 150,
          useNativeDriver: true,
        }),
        Animated.timing(scale, {
          toValue: 1,
          duration: 150,
          useNativeDriver: true,
        }),
      ]).start();
    }
  }, [plumes, scale]);

  const isInfinite = !isFinite(plumes);
  const isEmpty = plumes === 0;

  return (
    <Animated.View style={[s.badge, isEmpty && s.badgeEmpty, { transform: [{ scale }] }]}>
      <Text style={s.emoji}>🪶</Text>
      <Text style={[s.count, isEmpty && s.countEmpty]}>
        {isInfinite ? "\u221E" : plumes}
      </Text>
    </Animated.View>
  );
}

const getStyles = (colors: ThemeColors) =>
  StyleSheet.create({
    badge: {
      flexDirection: "row",
      alignItems: "center",
      backgroundColor: colors.surface,
      borderRadius: 12,
      paddingHorizontal: 8,
      paddingVertical: 4,
      gap: 4,
    },
    badgeEmpty: {
      backgroundColor: "#FDEDED",
    },
    emoji: {
      fontSize: 14,
    },
    count: {
      fontSize: 14,
      fontWeight: "600",
      color: colors.text,
    },
    countEmpty: {
      color: "#D32F2F",
    },
  });
