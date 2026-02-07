import type { TagDisplay } from "@/types";

/** Catalogue complet des tags thematiques */
export const TAG_CATALOG: Record<string, TagDisplay> = {
  sport:        { slug: "sport",        emoji: "\u26BD", labelKey: "grimoire.tags.sport" },
  culture:      { slug: "culture",      emoji: "\uD83C\uDFAD", labelKey: "grimoire.tags.culture" },
  gastronomie:  { slug: "gastronomie",  emoji: "\uD83C\uDF7D\uFE0F", labelKey: "grimoire.tags.gastronomie" },
  nature:       { slug: "nature",       emoji: "\uD83C\uDF3F", labelKey: "grimoire.tags.nature" },
  detente:      { slug: "detente",      emoji: "\uD83E\uDDD8", labelKey: "grimoire.tags.detente" },
  fete:         { slug: "fete",         emoji: "\uD83C\uDF89", labelKey: "grimoire.tags.fete" },
  creatif:      { slug: "creatif",      emoji: "\uD83C\uDFA8", labelKey: "grimoire.tags.creatif" },
  jeux:         { slug: "jeux",         emoji: "\uD83C\uDFAE", labelKey: "grimoire.tags.jeux" },
  musique:      { slug: "musique",      emoji: "\uD83C\uDFB5", labelKey: "grimoire.tags.musique" },
  cinema:       { slug: "cinema",       emoji: "\uD83C\uDFAC", labelKey: "grimoire.tags.cinema" },
  voyage:       { slug: "voyage",       emoji: "\u2708\uFE0F", labelKey: "grimoire.tags.voyage" },
  tech:         { slug: "tech",         emoji: "\uD83D\uDCBB", labelKey: "grimoire.tags.tech" },
  social:       { slug: "social",       emoji: "\uD83E\uDD1D", labelKey: "grimoire.tags.social" },
  insolite:     { slug: "insolite",     emoji: "\u2728", labelKey: "grimoire.tags.insolite" },
};

/** Slugs des tags par defaut pour l'initialisation */
export const DEFAULT_TAG_SLUGS = ["sport", "culture", "gastronomie", "nature", "detente", "fete"];

/** Tous les slugs disponibles */
export const ALL_TAG_SLUGS = Object.keys(TAG_CATALOG);

/** Recuperer l'affichage d'un tag avec fallback generique */
export function getTagDisplay(slug: string): TagDisplay {
  return TAG_CATALOG[slug] ?? { slug, emoji: "\uD83D\uDD16", labelKey: `grimoire.tags.${slug}` };
}
