import { useState } from "react";
import { View, Text, Image, StyleSheet, Platform } from "react-native";
import { useTranslation } from "react-i18next";
import { MASCOT_IMAGES, type MascotVariant } from "@/utils/mascotVariant";

const BACKGROUND = require("../../assets/images/destiny-parchment/background.webp");

// Zone de texte sur l'image 1080x1080 : (280,265) → (810,835)
const TEXT_LEFT = 280 / 1080;   // ~25.9%
const TEXT_TOP = 265 / 1080;    // ~24.5%
const TEXT_WIDTH = (810 - 280) / 1080;  // ~49.1%
const TEXT_HEIGHT = (835 - 265) / 1080; // ~52.8%

const FONT = Platform.select({ ios: "Georgia", android: "serif", default: "serif" });

interface Props {
  title: string;
  energy?: number;
  budget?: string;
  variant: MascotVariant;
}

export function DestinyParchment({ title, energy, budget, variant }: Props) {
  const { t } = useTranslation();
  const [wrapperSize, setWrapperSize] = useState(0);

  const metaParts: string[] = [];
  if (energy !== undefined) metaParts.push(`${t("context.energyLevel")} : ${energy}/5`);
  if (budget) metaParts.push(`${t("context.budget")} : ${budget}`);
  const metaText = metaParts.join("  \u2022  ");

  // Tailles de police proportionnelles à la taille du wrapper
  const fs = (ratio: number) => Math.max(8, Math.round(wrapperSize * ratio));

  return (
    <View
      style={s.wrapper}
      collapsable={false}
      onLayout={(e) => setWrapperSize(e.nativeEvent.layout.width)}
    >
      <View style={s.darkBg} />
      <Image source={BACKGROUND} style={s.parchment} resizeMode="cover" />

      {wrapperSize > 0 && (
        <View style={s.content}>
          <Text
            style={[s.title, { fontSize: fs(0.065) }]}
            numberOfLines={3}
            adjustsFontSizeToFit
            minimumFontScale={0.6}
          >
            {title}
          </Text>

          {metaText ? (
            <Text
              style={[s.meta, { fontSize: fs(0.035) }]}
              numberOfLines={1}
              adjustsFontSizeToFit
            >
              {metaText}
            </Text>
          ) : null}

          <Text style={[s.label, { fontSize: fs(0.032) }]}>
            — {t("result.parchmentLabel")} —
          </Text>
        </View>
      )}

      <Image source={MASCOT_IMAGES[variant]} style={s.mascot} resizeMode="contain" />
    </View>
  );
}

const s = StyleSheet.create({
  wrapper: {
    width: "100%",
    aspectRatio: 1,
    borderRadius: 16,
    overflow: "hidden",
    marginBottom: 20,
    ...Platform.select({
      ios: {
        shadowColor: "#000",
        shadowOffset: { width: 0, height: 4 },
        shadowOpacity: 0.3,
        shadowRadius: 8,
      },
      android: { elevation: 8 },
      default: {},
    }),
  },
  darkBg: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: "#121212",
  },
  parchment: {
    ...StyleSheet.absoluteFillObject,
    width: "100%",
    height: "100%",
  },
  content: {
    position: "absolute",
    left: `${TEXT_LEFT * 100}%`,
    top: `${TEXT_TOP * 100}%`,
    width: `${TEXT_WIDTH * 100}%`,
    height: `${TEXT_HEIGHT * 100}%`,
    justifyContent: "center",
    alignItems: "center",
  },
  title: {
    fontFamily: FONT,
    fontWeight: "bold",
    color: "#3B2314",
    textAlign: "center",
    marginBottom: 8,
  },
  meta: {
    fontFamily: FONT,
    fontStyle: "italic",
    color: "#6B5344",
    textAlign: "center",
    marginBottom: 6,
  },
  label: {
    fontFamily: FONT,
    fontStyle: "italic",
    color: "#8B7364",
    textAlign: "center",
  },
  mascot: {
    position: "absolute",
    bottom: -10,
    right: -10,
    width: "40%",
    height: "40%",
  },
});
