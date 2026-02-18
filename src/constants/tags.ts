import type { TagDisplay } from "@/types";

/** Catalogue complet des tags thematiques */
export const TAG_CATALOG: Record<string, TagDisplay> = {
  sport:       { slug: "sport",       emoji: "⚽", labelKey: "grimoire.tags.sport" },
  culture:     { slug: "culture",     emoji: "🎭", labelKey: "grimoire.tags.culture" },
  gastronomie: { slug: "gastronomie", emoji: "🍽️", labelKey: "grimoire.tags.gastronomie" },
  nature:      { slug: "nature",      emoji: "🌿", labelKey: "grimoire.tags.nature" },
  detente:     { slug: "detente",     emoji: "🧘", labelKey: "grimoire.tags.detente" },
  fete:        { slug: "fete",        emoji: "🎉", labelKey: "grimoire.tags.fete" },
  creatif:     { slug: "creatif",     emoji: "🎨", labelKey: "grimoire.tags.creatif" },
  jeux:        { slug: "jeux",        emoji: "🎮", labelKey: "grimoire.tags.jeux" },
  musique:     { slug: "musique",     emoji: "🎵", labelKey: "grimoire.tags.musique" },
  cinema:      { slug: "cinema",      emoji: "🎬", labelKey: "grimoire.tags.cinema" },
  voyage:      { slug: "voyage",      emoji: "✈️", labelKey: "grimoire.tags.voyage" },
  tech:        { slug: "tech",        emoji: "💻", labelKey: "grimoire.tags.tech" },
  social:      { slug: "social",      emoji: "🤝", labelKey: "grimoire.tags.social" },
  insolite:    { slug: "insolite",    emoji: "✨", labelKey: "grimoire.tags.insolite" },
};

/** Slugs des tags par defaut pour l'initialisation */
export const DEFAULT_TAG_SLUGS = ["sport", "culture", "gastronomie", "nature", "detente", "fete"];

/** Tous les slugs disponibles */
export const ALL_TAG_SLUGS = Object.keys(TAG_CATALOG);

/** Recuperer l'affichage d'un tag avec fallback generique */
export function getTagDisplay(slug: string): TagDisplay {
  return TAG_CATALOG[slug] ?? { slug, emoji: "🔖", labelKey: `grimoire.tags.${slug}` };
}

/** Environnements eligibles par theme (miroir de theme-engine serveur) */
const THEME_ENVIRONMENTS: Record<string, string[]> = {
  nature:  ["env_open_air"],
  cinema:  ["env_home", "env_shelter"],
  voyage:  ["env_shelter", "env_open_air"],
};

/** Retourne les slugs eligibles pour un environnement donne, melanges aleatoirement */
export function getEligibleThemeSlugs(environment: string): string[] {
  const eligible = ALL_TAG_SLUGS.filter((slug) => {
    const envs = THEME_ENVIRONMENTS[slug];
    return !envs || envs.includes(environment);
  });
  return eligible.sort(() => Math.random() - 0.5);
}
