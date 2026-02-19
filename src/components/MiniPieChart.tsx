import { View, Text, StyleSheet } from "react-native";
import Svg, { Path, Circle } from "react-native-svg";

export interface PieSlice {
  label: string;
  value: number;
  color: string;
}

interface Props {
  data: PieSlice[];
  size?: number;
  textColor: string;
}

export function MiniPieChart({ data, size = 140, textColor }: Props) {
  const total = data.reduce((sum, d) => sum + d.value, 0);
  if (total === 0) return null;

  const cx = size / 2;
  const cy = size / 2;
  const r = size / 2 - 2;

  // Single segment → full circle
  if (data.length === 1) {
    return (
      <View style={styles.container}>
        <Svg width={size} height={size}>
          <Circle cx={cx} cy={cy} r={r} fill={data[0].color} />
        </Svg>
        <Legend data={data} total={total} textColor={textColor} />
      </View>
    );
  }

  let currentAngle = -Math.PI / 2; // start at top
  const arcs = data.map((slice) => {
    const angle = (slice.value / total) * 2 * Math.PI;
    const startX = cx + r * Math.cos(currentAngle);
    const startY = cy + r * Math.sin(currentAngle);
    currentAngle += angle;
    const endX = cx + r * Math.cos(currentAngle);
    const endY = cy + r * Math.sin(currentAngle);
    const largeArc = angle > Math.PI ? 1 : 0;

    const d = [
      `M ${cx} ${cy}`,
      `L ${startX} ${startY}`,
      `A ${r} ${r} 0 ${largeArc} 1 ${endX} ${endY}`,
      "Z",
    ].join(" ");

    return { ...slice, d };
  });

  return (
    <View style={styles.container}>
      <Svg width={size} height={size}>
        {arcs.map((arc, i) => (
          <Path key={i} d={arc.d} fill={arc.color} />
        ))}
      </Svg>
      <Legend data={data} total={total} textColor={textColor} />
    </View>
  );
}

function Legend({ data, total, textColor }: { data: PieSlice[]; total: number; textColor: string }) {
  return (
    <View style={styles.legend}>
      {data.map((slice, i) => (
        <View key={i} style={styles.legendRow}>
          <View style={[styles.legendDot, { backgroundColor: slice.color }]} />
          <Text style={[styles.legendLabel, { color: textColor }]}>
            {slice.label} ({Math.round((slice.value / total) * 100)}%)
          </Text>
        </View>
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    alignItems: "center",
    gap: 12,
  },
  legend: {
    flexDirection: "row",
    flexWrap: "wrap",
    justifyContent: "center",
    gap: 10,
  },
  legendRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 5,
  },
  legendDot: {
    width: 10,
    height: 10,
    borderRadius: 5,
  },
  legendLabel: {
    fontSize: 12,
    fontWeight: "500",
  },
});
