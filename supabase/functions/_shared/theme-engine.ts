/**
 * Couche 4 : Theme Engine — Phase 2 du funnel V3
 *
 * Gère les 8 archetypes thématiques, l'éligibilité par environnement, et le tirage de duels.
 */

export interface ThemeConfig {
  slug: string;
  name: string;                      // Label descriptif pour le LLM (ex: "Jeux & Divertissement")
  emoji: string;
  eligibleEnvironments: string[];    // ["env_home", "env_shelter", "env_open_air"]
  placeTypes: string[];              // Google Place types (mode sortie)
}

/**
 * Matrice d'éligibilité environnement × thème + Google Place types
 */
export const THEMES: ThemeConfig[] = [
  {
    slug: "story_screen",
    name: "Histoires & Écrans",
    emoji: "📺",
    eligibleEnvironments: ["env_home", "env_shelter"],
    placeTypes: ["movie_theater", "amusement_center"],
  },
  {
    slug: "calm_escape",
    name: "Évasion & Calme",
    emoji: "📚",
    eligibleEnvironments: ["env_home", "env_shelter", "env_open_air"],
    placeTypes: ["spa", "beauty_salon", "library"],
  },
  {
    slug: "music_crea",
    name: "Musique & Créa",
    emoji: "🎨",
    eligibleEnvironments: ["env_home", "env_shelter", "env_open_air"],
    placeTypes: ["art_gallery", "performing_arts_theater", "night_club"],
  },
  {
    slug: "move_sport",
    name: "Mouvement & Sport",
    emoji: "🏃",
    eligibleEnvironments: ["env_home", "env_shelter", "env_open_air"],
    placeTypes: ["gym", "sports_complex", "stadium"],
  },
  {
    slug: "nature_adventure",
    name: "Nature & Aventure",
    emoji: "🌳",
    eligibleEnvironments: ["env_open_air"],
    placeTypes: ["park", "campground", "natural_feature", "tourist_attraction"],
  },
  {
    slug: "food_drink",
    name: "Gourmandise",
    emoji: "🍽️",
    eligibleEnvironments: ["env_home", "env_shelter", "env_open_air"],
    placeTypes: ["restaurant", "cafe", "bakery"],
  },
  {
    slug: "culture_knowledge",
    name: "Culture & Savoir",
    emoji: "🏛️",
    eligibleEnvironments: ["env_home", "env_shelter", "env_open_air"],
    placeTypes: ["museum", "art_gallery", "performing_arts_theater", "library", "tourist_attraction"],
  },
  {
    slug: "social_fun",
    name: "Jeux & Social",
    emoji: "🎲",
    eligibleEnvironments: ["env_home", "env_shelter", "env_open_air"],
    placeTypes: ["bar", "night_club", "amusement_center", "bowling_alley", "amusement_park", "cafe", "restaurant"],
  },
];

/**
 * Retourne tous les thèmes (les 8 archetypes sont toujours éligibles).
 */
export function getEligibleThemes(_context: { environment: string }): ThemeConfig[] {
  return [...THEMES];
}

/**
 * Tire 2 thèmes différents aléatoirement dans le pool éligible.
 */
export function pickThemeDuel(eligible: ThemeConfig[]): [ThemeConfig, ThemeConfig] {
  if (eligible.length < 2) {
    throw new Error(`Not enough eligible themes for duel (got ${eligible.length})`);
  }

  const shuffled = [...eligible].sort(() => Math.random() - 0.5);
  return [shuffled[0], shuffled[1]];
}

/**
 * Cherche un thème correspondant à des tags Q0.
 * Retourne le premier thème trouvé, ou null.
 */
export function getThemeByTags(tags: string[]): ThemeConfig | null {
  if (!tags || tags.length === 0) return null;

  for (const tag of tags) {
    const theme = THEMES.find((t) => t.slug === tag);
    if (theme) return theme;
  }

  return null;
}
