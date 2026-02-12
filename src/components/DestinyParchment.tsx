import { useState } from "react";
import { View, Text, Image, StyleSheet, Platform } from "react-native";
import { useTranslation } from "react-i18next";
import QRCode from "react-native-qrcode-svg";
import { MASCOT_IMAGES, type MascotVariant } from "@/utils/mascotVariant";

const DEFAULT_BACKGROUND = require("../../assets/images/destiny-parchment/parchment.webp");
const SEAL = require("../../assets/images/destiny-parchment/seal.webp");

// Metro requiert des appels require() statiques — un par tag
const TAG_BACKGROUNDS: Record<string, any> = {
  sport: require("../../assets/images/destiny-parchment/backgrounds/background-sport.webp"),
  culture: require("../../assets/images/destiny-parchment/backgrounds/background-culture.webp"),
  gastronomie: require("../../assets/images/destiny-parchment/backgrounds/background-gastronomie.webp"),
  nature: require("../../assets/images/destiny-parchment/backgrounds/background-nature.webp"),
  detente: require("../../assets/images/destiny-parchment/backgrounds/background-detente.webp"),
  fete: require("../../assets/images/destiny-parchment/backgrounds/background-fete.webp"),
  creatif: require("../../assets/images/destiny-parchment/backgrounds/background-creatif.webp"),
  jeux: require("../../assets/images/destiny-parchment/backgrounds/background-jeux.webp"),
  musique: require("../../assets/images/destiny-parchment/backgrounds/background-musique.webp"),
  cinema: require("../../assets/images/destiny-parchment/backgrounds/background-cinema.webp"),
  voyage: require("../../assets/images/destiny-parchment/backgrounds/background-voyage.webp"),
  tech: require("../../assets/images/destiny-parchment/backgrounds/background-tech.webp"),
  social: require("../../assets/images/destiny-parchment/backgrounds/background-social.webp"),
  insolite: require("../../assets/images/destiny-parchment/backgrounds/background-insolite.webp"),
};

function getBackground(tags?: string[]): any {
  if (tags) {
    for (const tag of tags) {
      if (TAG_BACKGROUNDS[tag]) return TAG_BACKGROUNDS[tag];
    }
  }
  return DEFAULT_BACKGROUND;
}

// Positions fixes (% du canvas 1080x1080)
const CONTENT_LEFT = 280 / 1080;            // ~25.9%
const CONTENT_WIDTH = (810 - 280) / 1080;   // ~49.1%

// Header fixe en haut
const HEADER_TOP = 140 / 1080;              // ~13%

// Zone centrale flexible (titre + metadata) entre header et footer
const MIDDLE_TOP = 195 / 1080;              // ~18%
const MIDDLE_BOTTOM = 680 / 1080;           // ~63%

// Footer + sceau fixes en bas
const FOOTER_TOP = 690 / 1080;              // ~63.9%
const SEAL_TOP = 730 / 1080;                // ~67.6%

const FONT = Platform.select({ ios: "Georgia", android: "serif", default: "serif" });

const PARCHMENT_COLORS = {
  title: "#1A0D05",
  header: "#8B5E3C",
  metaLabel: "#1A0D05",
  metaValue: "#3D2B1F",
  gaugeFilled: "#C7722B",
  gaugeEmpty: "#C9B99A",
  footer: "#6B4D3A",
};

// --- Helpers ---

function GaugeDots({ filled, total, size }: { filled: number; total: number; size: number }) {
  return (
    <View style={{ flexDirection: "row", gap: size * 0.4, alignItems: "center" }}>
      {Array.from({ length: total }, (_, i) => (
        <View
          key={i}
          style={{
            width: size,
            height: size,
            borderRadius: size / 2,
            ...(i < filled
              ? { backgroundColor: PARCHMENT_COLORS.gaugeFilled }
              : { borderWidth: 1.5, borderColor: PARCHMENT_COLORS.gaugeEmpty }),
          }}
        />
      ))}
    </View>
  );
}

function budgetToLevel(budget: string): number {
  const b = budget.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "");
  if (b === "gratuit" || b === "free" || b === "gratis") return 0;
  if (b === "eco" || b === "economique" || b === "budget") return 1;
  if (b === "standard" || b === "estandar") return 2;
  if (b === "premium" || b === "luxe" || b === "luxury" || b === "lujo") return 3;
  return 2;
}

function budgetLabel(budget: string): string {
  const level = budgetToLevel(budget);
  return ["Gratuit", "Éco", "Standard", "Premium"][level] ?? budget;
}

// --- Component ---

interface Props {
  title: string;
  energy?: number;
  budget?: string;
  social?: string;
  tags?: string[];
  variant: MascotVariant;
}

export function DestinyParchment({ title, energy, budget, social, tags, variant }: Props) {
  const { t } = useTranslation();
  const [wrapperSize, setWrapperSize] = useState(0);

  const fs = (ratio: number) => Math.max(8, Math.round(wrapperSize * ratio));
  const dotSize = Math.max(6, Math.round(wrapperSize * 0.022));
  const sealSize = Math.max(20, Math.round(wrapperSize * 0.09));
  const qrSize = Math.max(16, Math.round(wrapperSize * 0.06));
  const metaLabelWidth = Math.max(50, Math.round(wrapperSize * 0.18));

  const hasMetadata = social || energy !== undefined || budget;

  // Taille de police adaptative selon la longueur du titre
  const titleRatio = title.length > 30 ? 0.048 : title.length > 20 ? 0.055 : 0.065;

  return (
    <View
      style={s.wrapper}
      collapsable={false}
      onLayout={(e) => setWrapperSize(e.nativeEvent.layout.width)}
    >
      <View style={s.darkBg} />
      <Image source={getBackground(tags)} style={s.parchment} resizeMode="cover" />
      <Image source={DEFAULT_BACKGROUND} style={s.parchment} resizeMode="cover" />

      {wrapperSize > 0 && (
        <>
          {/* Header — position fixe */}
          <Text
            style={[s.header, {
              fontSize: fs(0.02),
              left: "15%",
              top: `${HEADER_TOP * 100}%`,
              width: "70%",
            }]}
            numberOfLines={1}
          >
            {"✦  " + t("result.parchmentHeader").toUpperCase() + "  ✦"}
          </Text>

          {/* Zone centrale flexible (titre + metadata) */}
          <View style={[s.middle, {
            left: `${CONTENT_LEFT * 100}%`,
            top: `${MIDDLE_TOP * 100}%`,
            width: `${CONTENT_WIDTH * 100}%`,
            height: `${(MIDDLE_BOTTOM - MIDDLE_TOP) * 100}%`,
          }]}>
            <Text
              style={[s.title, { fontSize: fs(titleRatio) }]}
              numberOfLines={3}
              adjustsFontSizeToFit
              minimumFontScale={0.6}
            >
              {title}
            </Text>

            {hasMetadata && (
              <View style={s.metaBlock}>
                {social && (
                  <View style={s.metaRow}>
                    <Text style={[s.metaDiamond, { fontSize: fs(0.024) }]}>◆</Text>
                    <Text style={[s.metaLabel, { fontSize: fs(0.024), width: metaLabelWidth }]}>
                      {t("result.parchmentAmbiance")}
                    </Text>
                    <Text style={[s.metaValue, { fontSize: fs(0.024) }]}>
                      {t(`context.social.${social}`, social)}
                    </Text>
                  </View>
                )}
                {energy !== undefined && (
                  <View style={s.metaRow}>
                    <Text style={[s.metaDiamond, { fontSize: fs(0.024) }]}>◆</Text>
                    <Text style={[s.metaLabel, { fontSize: fs(0.024), width: metaLabelWidth }]}>
                      {t("result.parchmentEnergy")}
                    </Text>
                    <GaugeDots filled={energy} total={5} size={dotSize} />
                  </View>
                )}
                {budget && (
                  <View style={s.metaRow}>
                    <Text style={[s.metaDiamond, { fontSize: fs(0.024) }]}>◆</Text>
                    <Text style={[s.metaLabel, { fontSize: fs(0.024), width: metaLabelWidth }]}>
                      {t("result.parchmentBudget")}
                    </Text>
                    <GaugeDots filled={budgetToLevel(budget)} total={3} size={dotSize} />
                    <Text style={[s.budgetLabelText, { fontSize: fs(0.02) }]}>
                      {budgetLabel(budget)}
                    </Text>
                  </View>
                )}
              </View>
            )}
          </View>

          {/* Footer — position fixe */}
          <Text
            style={[s.footer, {
              fontSize: fs(0.022),
              left: `${CONTENT_LEFT * 100}%`,
              top: `${FOOTER_TOP * 100}%`,
              width: `${CONTENT_WIDTH * 100}%`,
            }]}
          >
            {"— ★ " + t("result.parchmentLabel") + " ★ —"}
          </Text>

          {/* Seal — position fixe */}
          <Image
            source={SEAL}
            style={[s.seal, {
              width: sealSize,
              height: sealSize,
              left: (wrapperSize - sealSize) / 2,
              top: SEAL_TOP * wrapperSize,
            }]}
            resizeMode="contain"
          />

          {/* QR Code — position fixe, bottom-left */}
          <View style={[s.qrCode, { left: "15.7%", bottom: "11.5%" }]}>
            <QRCode
              value="https://play.google.com/apps/4701695797260563642"
              size={qrSize}
              color="#000000"
              backgroundColor="transparent"
            />
          </View>
        </>
      )}

      {/* Mascot */}
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
  header: {
    position: "absolute",
    fontFamily: FONT,
    fontWeight: "bold",
    color: PARCHMENT_COLORS.header,
    textAlign: "center",
    letterSpacing: 2,
  },
  middle: {
    position: "absolute",
    justifyContent: "center",
    alignItems: "center",
  },
  title: {
    fontFamily: FONT,
    fontWeight: "bold",
    color: PARCHMENT_COLORS.title,
    textAlign: "center",
    marginBottom: 8,
  },
  metaBlock: {
    alignSelf: "stretch",
    gap: 4,
  },
  metaRow: {
    flexDirection: "row",
    alignItems: "center",
  },
  metaDiamond: {
    color: PARCHMENT_COLORS.gaugeFilled,
    marginRight: 4,
  },
  metaLabel: {
    fontFamily: FONT,
    fontWeight: "bold",
    color: PARCHMENT_COLORS.metaLabel,
  },
  metaValue: {
    fontFamily: FONT,
    color: PARCHMENT_COLORS.metaValue,
  },
  budgetLabelText: {
    fontFamily: FONT,
    fontStyle: "italic",
    color: PARCHMENT_COLORS.metaValue,
    marginLeft: 6,
  },
  footer: {
    position: "absolute",
    fontFamily: FONT,
    fontStyle: "italic",
    color: PARCHMENT_COLORS.footer,
    textAlign: "center",
  },
  seal: {
    position: "absolute",
  },
  qrCode: {
    position: "absolute",
  },
  mascot: {
    position: "absolute",
    bottom: -10,
    right: -10,
    width: "40%",
    height: "40%",
  },
});
