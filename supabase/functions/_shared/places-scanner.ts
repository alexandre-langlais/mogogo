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
 * 1. Deduplique les placeTypes entre themes (~21 pour shelter)
 * 2. Lance 1 requete par type unique en parallele (Promise.allSettled)
 * 3. Concatene, deduplique par place_id
 * 4. Filtre (open now + rating >= minRating)
 * 5. Mappe vers OutdoorActivity[] avec attribution du theme
 */
export async function scanAllThemes(
  provider: IActivityProvider,
  themes: ThemeConfig[],
  location: { lat: number; lng: number },
  radius: number,
  language: string,
  filter: FilterCriteria,
): Promise<ScanResult> {
  const { uniqueTypes, typeToThemes } = getUniqueTypesWithMapping(themes);

  // 1 requete par type unique
  const requests = uniqueTypes.map(async (type) => {
    return provider.search({
      location,
      radius,
      types: [type],
      language,
    });
  });

  const results = await Promise.allSettled(requests);

  // Concatener tous les resultats bruts
  let rawCount = 0;
  let successfulRequests = 0;
  const allPlaces: Place[] = [];

  for (const result of results) {
    if (result.status === "fulfilled") {
      successfulRequests++;
      rawCount += result.value.length;
      allPlaces.push(...result.value);
    }
  }

  // Dedupliquer par place_id avant filtrage
  const seen = new Set<string>();
  const uniquePlaces = allPlaces.filter((p) => {
    if (!p.place_id || seen.has(p.place_id)) return false;
    seen.add(p.place_id);
    return true;
  });

  // Filtrer (open now, rating)
  const filtered = filterPlaces(uniquePlaces, filter);

  // Mapper vers OutdoorActivity[] avec attribution du theme
  const activities = mapAndDedup(filtered, typeToThemes);

  return {
    activities,
    totalRequests: uniqueTypes.length,
    successfulRequests,
    rawCount,
    shortage: activities.length < 5,
  };
}
