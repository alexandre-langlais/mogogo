import { View, Text, Image, StyleSheet, Platform } from "react-native";
import QRCode from "react-native-qrcode-svg";
import { useTranslation } from "react-i18next";
import { MASCOT_IMAGES, type MascotVariant } from "@/utils/mascotVariant";

const BACKGROUND = require("../../assets/images/destiny-parchment/background.webp");

interface Props {
  title: string;
  journey?: string[];
  energy?: number;
  budget?: string;
  variant: MascotVariant;
}

export function DestinyParchment({ title, journey, energy, budget, variant }: Props) {
  const { t } = useTranslation();

  const metaParts: string[] = [];
  if (energy !== undefined) metaParts.push(`${t("context.energyLevel")} : ${energy}/5`);
  if (budget) metaParts.push(`${t("context.budget")} : ${budget}`);
  const metaText = metaParts.join("  \u2022  ");

  return (
    <View style={s.wrapper} collapsable={false}>
      {/* Fond sombre */}
      <View style={s.darkBg} />

      {/* Texture parchemin */}
      <Image source={BACKGROUND} style={s.parchment} resizeMode="cover" />

      {/* Contenu textuel */}
      <View style={s.content}>
        <Text style={s.title}>{title}</Text>

        {journey && journey.length > 0 ? (
          <View style={s.journeyContainer}>
            <Text style={s.journeyLabel}>{t("result.parchmentJourney")}</Text>
            <Text style={s.journeyText}>{journey.join("  \u2727  ")}</Text>
          </View>
        ) : null}

        {metaText ? <Text style={s.meta}>{metaText}</Text> : null}

        <Text style={s.label}>— {t("result.parchmentLabel")} —</Text>

        {/* QR Code */}
        <View style={s.qrContainer}>
          <QRCode
            value="https://mogogo.app"
            size={100}
            color="#3B2314"
            backgroundColor="transparent"
          />
          <Text style={s.qrLabel}>{t("result.parchmentScan")}</Text>
        </View>
      </View>

      {/* Mascotte */}
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
    // Ombre portee
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
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
    paddingHorizontal: 32,
    paddingTop: 24,
    paddingBottom: 80,
  },
  title: {
    fontFamily: Platform.select({ ios: "Georgia", android: "serif", default: "serif" }),
    fontSize: 28,
    fontWeight: "bold",
    color: "#3B2314",
    textAlign: "center",
    marginBottom: 12,
  },
  journeyContainer: {
    alignItems: "center",
    marginBottom: 10,
  },
  journeyLabel: {
    fontFamily: Platform.select({ ios: "Georgia", android: "serif", default: "serif" }),
    fontSize: 11,
    color: "#8B7364",
    textTransform: "uppercase",
    letterSpacing: 1.5,
    marginBottom: 4,
  },
  journeyText: {
    fontFamily: Platform.select({ ios: "Georgia", android: "serif", default: "serif" }),
    fontSize: 13,
    fontStyle: "italic",
    color: "#5A4234",
    textAlign: "center",
  },
  meta: {
    fontFamily: Platform.select({ ios: "Georgia", android: "serif", default: "serif" }),
    fontSize: 14,
    fontStyle: "italic",
    color: "#6B5344",
    textAlign: "center",
    marginBottom: 8,
  },
  label: {
    fontFamily: Platform.select({ ios: "Georgia", android: "serif", default: "serif" }),
    fontSize: 13,
    fontStyle: "italic",
    color: "#8B7364",
    textAlign: "center",
    marginBottom: 16,
  },
  qrContainer: {
    alignItems: "center",
    marginTop: 8,
  },
  qrLabel: {
    fontFamily: Platform.select({ ios: "Georgia", android: "serif", default: "serif" }),
    fontSize: 11,
    fontStyle: "italic",
    color: "#6B5344",
    marginTop: 6,
  },
  mascot: {
    position: "absolute",
    bottom: -10,
    right: -10,
    width: "40%",
    height: "40%",
  },
});
