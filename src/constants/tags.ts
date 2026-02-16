import type { TagDisplay } from "@/types";

/** Catalogue complet des tags thematiques */
export const TAG_CATALOG: Record<string, TagDisplay> = {
  sport:     { slug: "sport",     emoji: "💪", labelKey: "grimoire.tags.sport" },
  arts:      { slug: "arts",      emoji: "🎨", labelKey: "grimoire.tags.arts" },
  savoir:    { slug: "savoir",    emoji: "📚", labelKey: "grimoire.tags.savoir" },
  social:    { slug: "social",    emoji: "🤝", labelKey: "grimoire.tags.social" },
  bien_etre: { slug: "bien_etre", emoji: "🧘", labelKey: "grimoire.tags.bien_etre" },
  jeux:      { slug: "jeux",      emoji: "🎮", labelKey: "grimoire.tags.jeux" },
  nature:    { slug: "nature",    emoji: "🌿", labelKey: "grimoire.tags.nature" },
  maison:    { slug: "maison",    emoji: "🏠", labelKey: "grimoire.tags.maison" },
};

/** Slugs des tags par defaut pour l'initialisation */
export const DEFAULT_TAG_SLUGS = ["sport", "arts", "savoir", "social", "bien_etre", "nature"];

/** Tous les slugs disponibles */
export const ALL_TAG_SLUGS = Object.keys(TAG_CATALOG);

/** Recuperer l'affichage d'un tag avec fallback generique */
export function getTagDisplay(slug: string): TagDisplay {
  return TAG_CATALOG[slug] ?? { slug, emoji: "🔖", labelKey: `grimoire.tags.${slug}` };
}
