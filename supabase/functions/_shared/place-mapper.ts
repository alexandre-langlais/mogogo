/**
 * Mapping deterministe Place → OutdoorActivity.
 *
 * Fonctions pures, pas de I/O. Testable sans mock.
 */

import type { Place } from "./activity-provider.ts";
import type { ThemeConfig } from "./theme-engine.ts";
import type { OutdoorActivity } from "./outdoor-types.ts";

/**
 * Convertit une Place Google en OutdoorActivity.
 * Retourne null si la place n'a pas de place_id ou de nom.
 */
export function placeToOutdoorActivity(
  place: Place,
  theme: ThemeConfig,
): OutdoorActivity | null {
  if (!place.place_id || !place.name) return null;

  return {
    id: place.place_id,
    source: "google_places",
    name: place.name,
    themeSlug: theme.slug,
    themeEmoji: theme.emoji,
    rating: place.rating ?? null,
    userRatingCount: place.user_rating_count ?? null,
    vicinity: place.vicinity ?? "",
    formattedAddress: place.vicinity ?? "",
    isOpen: place.opening_hours?.open_now ?? null,
    coordinates: {
      lat: place.geometry.location.lat,
      lng: place.geometry.location.lng,
    },
    placeTypes: place.types ?? [],
    priceLevel: place.price_level ?? null,
    goodForChildren: place.good_for_children,
  };
}

/**
 * Deduplique les placeTypes entre les themes et construit le mapping inverse.
 *
 * Retourne :
 * - uniqueTypes : liste de types uniques a scanner (1 requete Google chacun)
 * - typeToThemes : mapping type → themes correspondants (pour attribution apres scan)
 */
export function getUniqueTypesWithMapping(
  themes: ThemeConfig[],
): { uniqueTypes: string[]; typeToThemes: Map<string, ThemeConfig[]> } {
  const typeToThemes = new Map<string, ThemeConfig[]>();

  for (const theme of themes) {
    for (const type of theme.placeTypes) {
      const existing = typeToThemes.get(type);
      if (existing) {
        existing.push(theme);
      } else {
        typeToThemes.set(type, [theme]);
      }
    }
  }

  return {
    uniqueTypes: [...typeToThemes.keys()],
    typeToThemes,
  };
}

/**
 * Mappe et deduplique des Places brutes en OutdoorActivity[].
 *
 * Chaque Place est attribuee au PREMIER theme correspondant via ses types.
 * Deduplication par place_id.
 */
export function mapAndDedup(
  places: Place[],
  typeToThemes: Map<string, ThemeConfig[]>,
): OutdoorActivity[] {
  const seen = new Set<string>();
  const result: OutdoorActivity[] = [];

  for (const place of places) {
    if (!place.place_id || seen.has(place.place_id)) continue;

    // Trouver le premier theme correspondant a un des types de la place
    let matchedTheme: ThemeConfig | null = null;
    for (const type of place.types ?? []) {
      const themes = typeToThemes.get(type);
      if (themes && themes.length > 0) {
        matchedTheme = themes[0];
        break;
      }
    }

    if (!matchedTheme) continue;

    const activity = placeToOutdoorActivity(place, matchedTheme);
    if (activity) {
      seen.add(place.place_id);
      result.push(activity);
    }
  }

  return result;
}
