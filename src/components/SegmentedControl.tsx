import { View, Text, Pressable, StyleSheet } from "react-native";
import { useTheme } from "@/contexts/ThemeContext";
import type { ThemeColors } from "@/constants";

interface Segment {
  key: string;
  label: string;
}

interface Props {
  segments: Segment[];
  activeKey: string;
  onSelect: (key: string) => void;
}

export function SegmentedControl({ segments, activeKey, onSelect }: Props) {
  const { colors } = useTheme();
  const s = getStyles(colors);

  return (
    <View style={s.container}>
      {segments.map((seg) => {
        const active = seg.key === activeKey;
        return (
          <Pressable
            key={seg.key}
            style={[s.segment, active && s.segmentActive]}
            onPress={() => onSelect(seg.key)}
          >
            <Text style={[s.label, active && s.labelActive]}>{seg.label}</Text>
          </Pressable>
        );
      })}
    </View>
  );
}

const getStyles = (colors: ThemeColors) =>
  StyleSheet.create({
    container: {
      flexDirection: "row",
      backgroundColor: colors.border,
      borderRadius: 12,
      padding: 3,
      marginHorizontal: 16,
      marginTop: 12,
      marginBottom: 8,
    },
    segment: {
      flex: 1,
      paddingVertical: 10,
      alignItems: "center",
      borderRadius: 10,
    },
    segmentActive: {
      backgroundColor: colors.surface,
      shadowColor: "#000",
      shadowOffset: { width: 0, height: 1 },
      shadowOpacity: 0.1,
      shadowRadius: 2,
      elevation: 2,
    },
    label: {
      fontSize: 14,
      fontWeight: "600",
      color: colors.textSecondary,
    },
    labelActive: {
      color: colors.primary,
    },
  });
