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
  arts: require("../../assets/images/destiny-parchment/backgrounds/background-arts.webp"),
  savoir: require("../../assets/images/destiny-parchment/backgrounds/background-savoir.webp"),
  social: require("../../assets/images/destiny-parchment/backgrounds/background-social.webp"),
  bien_etre: require("../../assets/images/destiny-parchment/backgrounds/background-bien_etre.webp"),
  jeux: require("../../assets/images/destiny-parchment/backgrounds/background-jeux.webp"),
  nature: require("../../assets/images/destiny-parchment/backgrounds/background-nature.webp"),
  maison: require("../../assets/images/destiny-parchment/backgrounds/background-maison.webp"),
  gastronomie: require("../../assets/images/destiny-parchment/backgrounds/background-gastronomie.webp"),
  cinema: require("../../assets/images/destiny-parchment/backgrounds/background-cinema.webp"),
  detente: require("../../assets/images/destiny-parchment/backgrounds/background-detente.webp"),
  culture: require("../../assets/images/destiny-parchment/backgrounds/background-culture.webp"),
  fete: require("../../assets/images/destiny-parchment/backgrounds/background-fete.webp"),
  musique: require("../../assets/images/destiny-parchment/backgrounds/background-musique.webp"),
  creatif: require("../../assets/images/destiny-parchment/backgrounds/background-creatif.webp"),
  voyage: require("../../assets/images/destiny-parchment/backgrounds/background-voyage.webp"),
  tech: require("../../assets/images/destiny-parchment/backgrounds/background-tech.webp"),
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
const MIDDLE_TOP = 175 / 1080;              // ~16.2%
const MIDDLE_BOTTOM = 680 / 1080;           // ~63%

// Footer + sceau fixes en bas
const FOOTER_TOP = 720 / 1080;              // ~66.7%
const SEAL_TOP = 760 / 1080;                // ~70.4%

const FONT = Platform.select({ ios: "Georgia", android: "serif", default: "serif" });

const PARCHMENT_COLORS = {
  title: "#1A0D05",
  header: "#8B5E3C",
  metaValue: "#3D2B1F",
  footer: "#6B4D3A",
};

// --- Helpers ---

// --- Component ---

interface Props {
  title: string;
  environment?: string;
  social?: string;
  tags?: string[];
  variant: MascotVariant;
  /** Résumé LLM de l'activité (affiché en italique entre titre et tags) */
  description?: string;
  /** Sous-titre (ex: adresse pour outdoor) affiché sous le titre */
  subtitle?: string;
  /** Résumé éditorial du lieu (affiché entre guillemets au-dessus du footer) */
  editorialSummary?: string;
}

export function DestinyParchment({ title, environment, social, tags, variant, description, subtitle, editorialSummary }: Props) {
  const { t } = useTranslation();
  const [wrapperSize, setWrapperSize] = useState(0);

  const fs = (ratio: number) => Math.max(8, Math.round(wrapperSize * ratio));
  const sealSize = Math.max(20, Math.round(wrapperSize * 0.09));
  const qrSize = Math.max(16, Math.round(wrapperSize * 0.06));


  const hasMetadata = !!subtitle || !!editorialSummary || !!description;

  // Ligne tags : [THEMATIQUE] ✦ [ENVIRONNEMENT] ✦ [SOCIAL]
  const tagParts: string[] = [];
  if (tags?.[0]) {
    tagParts.push(t(`grimoire.tags.${tags[0]}`, { defaultValue: tags[0] }));
  }
  if (environment) {
    const envLabel = t(`dashboard.communityEnv.${environment}`, { defaultValue: "" });
    if (envLabel) tagParts.push(envLabel);
  }
  if (social) {
    const socialLabel = t(`context.social.${social}`, { defaultValue: "" });
    if (socialLabel) tagParts.push(socialLabel);
  }
  const tagLine = tagParts.length > 0 ? tagParts.join(" ✦ ") : null;

  // Taille de police adaptative selon la longueur du titre
  const totalTextLen = title.length + (subtitle?.length ?? 0);
  const titleRatio = totalTextLen > 50 ? 0.042 : title.length > 30 ? 0.048 : title.length > 20 ? 0.055 : 0.065;

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

            {description && (
              <Text
                style={[s.description, { fontSize: fs(0.028) }]}
                numberOfLines={5}
                adjustsFontSizeToFit={false}
              >
                {description}
              </Text>
            )}

            {hasMetadata && (
              <View style={s.metaBlock}>
                {subtitle && (
                  <Text
                    style={[s.subtitle, { fontSize: fs(0.038) }]}
                    numberOfLines={2}
                    adjustsFontSizeToFit
                    minimumFontScale={0.7}
                  >
                    {subtitle}
                  </Text>
                )}
                {editorialSummary && (
                  <Text
                    style={[s.editorialQuote, { fontSize: fs(0.022) }]}
                    numberOfLines={3}
                    adjustsFontSizeToFit
                    minimumFontScale={0.7}
                  >
                    {`« ${editorialSummary} »`}
                  </Text>
                )}
              </View>
            )}
          </View>

          {/* Tag line — juste au-dessus du footer */}
          {tagLine && (
            <Text
              style={[s.tagLine, {
                fontSize: fs(0.019),
                left: `${CONTENT_LEFT * 100}%`,
                top: `${FOOTER_TOP * 100}%`,
                width: `${CONTENT_WIDTH * 100}%`,
                transform: [{ translateY: -20 }],
              }]}
              numberOfLines={1}
              adjustsFontSizeToFit
              minimumFontScale={0.7}
            >
              {tagLine}
            </Text>
          )}

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
    marginBottom: 6,
  },
  description: {
    fontFamily: FONT,
    fontStyle: "italic",
    color: PARCHMENT_COLORS.metaValue,
    textAlign: "center",
    marginBottom: 8,
  },
  tagLine: {
    position: "absolute",
    fontFamily: FONT,
    color: PARCHMENT_COLORS.header,
    fontWeight: "bold",
    letterSpacing: 1,
    textAlign: "center",
    textTransform: "uppercase",
  },
  metaBlock: {
    alignSelf: "stretch",
    alignItems: "center",
    gap: 4,
  },
  subtitle: {
    fontFamily: FONT,
    color: PARCHMENT_COLORS.metaValue,
    textAlign: "center",
    marginBottom: 2,
  },
  editorialQuote: {
    fontFamily: FONT,
    fontStyle: "italic",
    color: PARCHMENT_COLORS.metaValue,
    textAlign: "center",
    marginTop: 6,
  },
  metaValue: {
    fontFamily: FONT,
    color: PARCHMENT_COLORS.metaValue,
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
