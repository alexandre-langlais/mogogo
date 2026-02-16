/**
 * Couche 4 : Theme Engine — Phase 2 du funnel V3
 *
 * Gère les 8 thèmes, l'éligibilité par environnement, et le tirage de duels.
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
    slug: "sport",
    name: "Sport",
    emoji: "⚽",
    eligibleEnvironments: ["env_home", "env_shelter", "env_open_air"],
    placeTypes: ["gym", "sports_complex", "stadium"],
  },
  {
    slug: "culture",
    name: "Culture",
    emoji: "🎭",
    eligibleEnvironments: ["env_home", "env_shelter", "env_open_air"],
    placeTypes: ["museum", "art_gallery", "performing_arts_theater", "library"],
  },
  {
    slug: "gastronomie",
    name: "Gastronomie",
    emoji: "🍽️",
    eligibleEnvironments: ["env_home", "env_shelter", "env_open_air"],
    placeTypes: ["restaurant", "cafe", "bakery"],
  },
  {
    slug: "nature",
    name: "Nature",
    emoji: "🌿",
    eligibleEnvironments: ["env_open_air"],
    placeTypes: ["park", "campground", "natural_feature", "tourist_attraction"],
  },
  {
    slug: "detente",
    name: "Détente",
    emoji: "🧘",
    eligibleEnvironments: ["env_home", "env_shelter", "env_open_air"],
    placeTypes: ["spa", "beauty_salon"],
  },
  {
    slug: "fete",
    name: "Fête",
    emoji: "🎉",
    eligibleEnvironments: ["env_home", "env_shelter", "env_open_air"],
    placeTypes: ["night_club", "bar"],
  },
  {
    slug: "creatif",
    name: "Créatif",
    emoji: "🎨",
    eligibleEnvironments: ["env_home", "env_shelter", "env_open_air"],
    placeTypes: ["art_gallery"],
  },
  {
    slug: "jeux",
    name: "Jeux",
    emoji: "🎮",
    eligibleEnvironments: ["env_home", "env_shelter", "env_open_air"],
    placeTypes: ["amusement_center", "bowling_alley", "amusement_park"],
  },
  {
    slug: "musique",
    name: "Musique",
    emoji: "🎵",
    eligibleEnvironments: ["env_home", "env_shelter", "env_open_air"],
    placeTypes: ["performing_arts_theater", "night_club"],
  },
  {
    slug: "cinema",
    name: "Cinéma",
    emoji: "🎬",
    eligibleEnvironments: ["env_home", "env_shelter"],
    placeTypes: ["movie_theater"],
  },
  {
    slug: "voyage",
    name: "Voyage",
    emoji: "✈️",
    eligibleEnvironments: ["env_shelter", "env_open_air"],
    placeTypes: ["tourist_attraction", "travel_agency"],
  },
  {
    slug: "tech",
    name: "Tech",
    emoji: "💻",
    eligibleEnvironments: ["env_home", "env_shelter", "env_open_air"],
    placeTypes: ["electronics_store"],
  },
  {
    slug: "social",
    name: "Social",
    emoji: "🤝",
    eligibleEnvironments: ["env_home", "env_shelter", "env_open_air"],
    placeTypes: ["bar", "cafe", "restaurant"],
  },
  {
    slug: "insolite",
    name: "Insolite",
    emoji: "✨",
    eligibleEnvironments: ["env_home", "env_shelter", "env_open_air"],
    placeTypes: ["tourist_attraction", "amusement_park"],
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
