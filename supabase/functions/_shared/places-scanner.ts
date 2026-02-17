/**
 * Orchestrateur de scan multi-themes.
 *
 * Scanne tous les themes eligibles en parallele via Google Places,
 * filtre, mappe et deduplique les resultats.
 */

import type { IActivityProvider, Place } from "./activity-provider.ts";
import type { FilterCriteria } from "./filter-service.ts";
import { filterPlaces } from "./filter-service.ts";
import type { ThemeConfig } from "./theme-engine.ts";
import type { OutdoorActivity } from "./outdoor-types.ts";
import { getUniqueTypesWithMapping, mapAndDedup } from "./place-mapper.ts";

export interface ScanResult {
  activities: OutdoorActivity[];
  totalRequests: number;        // nombre de requetes API lancees
  successfulRequests: number;   // reussies
  rawCount: number;             // avant filtrage
  shortage: boolean;            // activities.length < 5
}

/**
 * Scanne tous les themes eligibles autour d'une position.
 *
 * 1. Deduplique les placeTypes entre themes
 * 2. Lance 1 SEUL appel nearbySearch avec tous les types (Atmosphere SKU)
 * 3. Filtre (open now + rating >= minRating)
 * 4. Mappe vers OutdoorActivity[] avec attribution du theme
 */
export async function scanAllThemes(
  provider: IActivityProvider,
  themes: ThemeConfig[],
  location: { lat: number; lng: number },
  radius: number,
  language: string,
  filter: FilterCriteria,
  options?: { familyWithYoungChildren?: boolean },
): Promise<ScanResult> {
  const { uniqueTypes, typeToThemes } = getUniqueTypesWithMapping(themes);

  // 1 SEUL appel avec tous les types
  let rawPlaces: Place[] = [];
  try {
    rawPlaces = await provider.search({
      location,
      radius,
      types: uniqueTypes,
      language,
      familyWithYoungChildren: options?.familyWithYoungChildren,
    });
  } catch (err) {
    console.error("[scanAllThemes] search failed:", err);
  }

  // Ajouter le filtre goodForChildren si famille avec enfants < 12 ans
  if (options?.familyWithYoungChildren) {
    filter = { ...filter, requireGoodForChildren: true };
  }
  const filtered = filterPlaces(rawPlaces, filter);
  const activities = mapAndDedup(filtered, typeToThemes);

  return {
    activities,
    totalRequests: 1,
    successfulRequests: rawPlaces.length > 0 ? 1 : 0,
    rawCount: rawPlaces.length,
    shortage: activities.length < 5,
  };
}
