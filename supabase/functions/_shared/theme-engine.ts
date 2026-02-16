/**
 * Couche 4 : Theme Engine — Phase 2 du funnel V3
 *
 * Gère les 14 thèmes, l'éligibilité par environnement, et le tirage de duels.
 */

export interface ThemeConfig {
  slug: string;
  emoji: string;
  eligibleEnvironments: string[];    // ["env_home", "env_shelter", "env_open_air"]
  placeTypes: string[];              // Google Place types (mode sortie)
}

/**
 * Matrice d'éligibilité environnement × thème + Google Place types
 */
export const THEMES: ThemeConfig[] = [
  {
    slug: "sport",
    emoji: "⚽",
    eligibleEnvironments: ["env_shelter", "env_open_air"],
    placeTypes: ["gym", "sports_complex", "stadium"],
  },
  {
    slug: "culture",
    emoji: "🎭",
    eligibleEnvironments: ["env_home", "env_shelter", "env_open_air"],
    placeTypes: ["museum", "art_gallery", "library"],
  },
  {
    slug: "gastronomie",
    emoji: "🍽️",
    eligibleEnvironments: ["env_home", "env_shelter", "env_open_air"],
    placeTypes: ["restaurant", "cafe", "bakery"],
  },
  {
    slug: "nature",
    emoji: "🌿",
    eligibleEnvironments: ["env_open_air"],
    placeTypes: ["park", "campground", "natural_feature"],
  },
  {
    slug: "detente",
    emoji: "🧘",
    eligibleEnvironments: ["env_home", "env_shelter", "env_open_air"],
    placeTypes: ["spa", "beauty_salon"],
  },
  {
    slug: "fete",
    emoji: "🎉",
    eligibleEnvironments: ["env_home", "env_shelter", "env_open_air"],
    placeTypes: ["night_club", "bar", "amusement_park"],
  },
  {
    slug: "creatif",
    emoji: "🎨",
    eligibleEnvironments: ["env_home", "env_shelter", "env_open_air"],
    placeTypes: ["art_gallery", "art_studio"],
  },
  {
    slug: "jeux",
    emoji: "🎮",
    eligibleEnvironments: ["env_home", "env_shelter", "env_open_air"],
    placeTypes: ["amusement_center", "bowling_alley"],
  },
  {
    slug: "musique",
    emoji: "🎵",
    eligibleEnvironments: ["env_home", "env_shelter", "env_open_air"],
    placeTypes: ["live_music_venue", "performing_arts_theater"],
  },
  {
    slug: "cinema",
    emoji: "🎬",
    eligibleEnvironments: ["env_home", "env_shelter"],
    placeTypes: ["movie_theater"],
  },
  {
    slug: "voyage",
    emoji: "✈️",
    eligibleEnvironments: ["env_open_air"],
    placeTypes: ["tourist_attraction", "travel_agency"],
  },
  {
    slug: "tech",
    emoji: "💻",
    eligibleEnvironments: ["env_home", "env_shelter"],
    placeTypes: ["electronics_store"],
  },
  {
    slug: "social",
    emoji: "🤝",
    eligibleEnvironments: ["env_home", "env_shelter", "env_open_air"],
    placeTypes: ["bar", "cafe"],
  },
  {
    slug: "insolite",
    emoji: "✨",
    eligibleEnvironments: ["env_home", "env_shelter", "env_open_air"],
    placeTypes: ["tourist_attraction", "amusement_park", "escape_room"],
  },
];

/**
 * Filtre les thèmes éligibles selon le contexte (environnement).
 */
export function getEligibleThemes(context: { environment: string }): ThemeConfig[] {
  return THEMES.filter((theme) =>
    theme.eligibleEnvironments.includes(context.environment),
  );
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
