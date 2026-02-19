import { View, Text, StyleSheet } from "react-native";
import Svg, { Rect } from "react-native-svg";

export interface BarItem {
  label: string;
  value: number;
  color: string;
  emoji?: string;
}

interface Props {
  data: BarItem[];
  height?: number;
  textColor: string;
  secondaryColor: string;
}

export function MiniBarChart({ data, height = 120, textColor, secondaryColor }: Props) {
  const filtered = data.filter((d) => d.value > 0).sort((a, b) => b.value - a.value);
  if (filtered.length === 0) return null;

  const maxVal = Math.max(...filtered.map((d) => d.value));
  const barWidth = 28;
  const gap = 12;
  const chartWidth = filtered.length * (barWidth + gap) - gap;
  const topPadding = 20; // space for count label above bars

  return (
    <View style={styles.container}>
      <Svg width={chartWidth} height={height + topPadding}>
        {filtered.map((item, i) => {
          const barH = (item.value / maxVal) * height;
          const x = i * (barWidth + gap);
          const y = height + topPadding - barH;
          return (
            <Rect
              key={i}
              x={x}
              y={y}
              width={barWidth}
              height={barH}
              rx={6}
              fill={item.color}
            />
          );
        })}
      </Svg>
      {/* Count labels above bars */}
      <View style={[styles.labelsRow, { width: chartWidth, top: 0, position: "absolute" }]}>
        {filtered.map((item, i) => (
          <Text
            key={i}
            style={[
              styles.countLabel,
              {
                color: textColor,
                width: barWidth,
                marginRight: i < filtered.length - 1 ? gap : 0,
                marginTop: height + topPadding - (item.value / maxVal) * height - 18,
              },
            ]}
          >
            {item.value}
          </Text>
        ))}
      </View>
      {/* Emoji labels below bars */}
      <View style={[styles.labelsRow, { width: chartWidth }]}>
        {filtered.map((item, i) => (
          <Text
            key={i}
            style={[
              styles.emojiLabel,
              { width: barWidth, marginRight: i < filtered.length - 1 ? gap : 0 },
            ]}
          >
            {item.emoji ?? item.label.slice(0, 2)}
          </Text>
        ))}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    alignItems: "center",
    gap: 6,
  },
  labelsRow: {
    flexDirection: "row",
    justifyContent: "flex-start",
  },
  countLabel: {
    fontSize: 11,
    fontWeight: "700",
    textAlign: "center",
  },
  emojiLabel: {
    fontSize: 18,
    textAlign: "center",
  },
});
