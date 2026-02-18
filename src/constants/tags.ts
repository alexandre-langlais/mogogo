import type { TagDisplay } from "@/types";

/** Catalogue complet des tags thematiques (8 archetypes) */
export const TAG_CATALOG: Record<string, TagDisplay> = {
  story_screen:      { slug: "story_screen",      emoji: "📺", labelKey: "grimoire.tags.story_screen" },
  calm_escape:       { slug: "calm_escape",        emoji: "📚", labelKey: "grimoire.tags.calm_escape" },
  music_crea:        { slug: "music_crea",        emoji: "🎨", labelKey: "grimoire.tags.music_crea" },
  move_sport:        { slug: "move_sport",         emoji: "🏃", labelKey: "grimoire.tags.move_sport" },
  nature_adventure:  { slug: "nature_adventure",   emoji: "🌳", labelKey: "grimoire.tags.nature_adventure" },
  food_drink:        { slug: "food_drink",         emoji: "🍽️", labelKey: "grimoire.tags.food_drink" },
  culture_knowledge: { slug: "culture_knowledge",  emoji: "🏛️", labelKey: "grimoire.tags.culture_knowledge" },
  social_fun:        { slug: "social_fun",         emoji: "🎲", labelKey: "grimoire.tags.social_fun" },
};

/** Slugs des tags par defaut pour l'initialisation (tous les 8 archetypes) */
export const DEFAULT_TAG_SLUGS = ["story_screen", "calm_escape", "music_crea", "move_sport", "nature_adventure", "food_drink", "culture_knowledge", "social_fun"];

/** Tous les slugs disponibles */
export const ALL_TAG_SLUGS = Object.keys(TAG_CATALOG);

/** Recuperer l'affichage d'un tag avec fallback generique */
export function getTagDisplay(slug: string): TagDisplay {
  return TAG_CATALOG[slug] ?? { slug, emoji: "🔖", labelKey: `grimoire.tags.${slug}` };
}

/** Environnements eligibles par theme (miroir de theme-engine serveur) */
const THEME_ENVIRONMENTS: Record<string, string[]> = {
  nature_adventure: ["env_open_air"],
  story_screen:     ["env_home", "env_shelter"],
};

/** Retourne les slugs eligibles pour un environnement donne, melanges aleatoirement */
export function getEligibleThemeSlugs(environment: string): string[] {
  const eligible = ALL_TAG_SLUGS.filter((slug) => {
    const envs = THEME_ENVIRONMENTS[slug];
    return !envs || envs.includes(environment);
  });
  return eligible.sort(() => Math.random() - 0.5);
}
