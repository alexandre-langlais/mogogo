/** Variantes de mascotte disponibles */
export type MascotVariant = "chill" | "cinema" | "eat" | "party" | "sport";

/** Mapping tag slug → variante mascotte */
const TAG_TO_VARIANT: Record<string, MascotVariant> = {
  sport: "sport",
  culture: "cinema",
  gastronomie: "eat",
  nature: "chill",
  detente: "chill",
  fete: "party",
  creatif: "chill",
  jeux: "sport",
  musique: "party",
  cinema: "cinema",
  voyage: "chill",
  tech: "chill",
  social: "party",
  insolite: "party",
};

/** Determine la variante de mascotte a partir des tags de la recommandation */
export function getMascotVariant(tags?: string[]): MascotVariant {
  if (!tags || tags.length === 0) return "chill";
  return TAG_TO_VARIANT[tags[0]] ?? "chill";
}

/** Images des variantes de mascotte */
export const MASCOT_IMAGES: Record<MascotVariant, ReturnType<typeof require>> = {
  chill: require("../../assets/images/destiny-parchment/mogogo-chill.webp"),
  cinema: require("../../assets/images/destiny-parchment/mogogo-cinema.webp"),
  eat: require("../../assets/images/destiny-parchment/mogogo-eat.webp"),
  party: require("../../assets/images/destiny-parchment/mogogo-party.webp"),
  sport: require("../../assets/images/destiny-parchment/mogogo-sport.webp"),
};
