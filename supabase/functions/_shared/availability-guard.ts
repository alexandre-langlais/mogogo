/**
 * Couche 3 : Le Radar — Vérification de disponibilité
 *
 * Vérifie qu'au moins un lieu est disponible après filtrage Vigile.
 */

import type { IActivityProvider, Place, SearchCriteria } from "./activity-provider.ts";
import { filterPlaces, type FilterCriteria } from "./filter-service.ts";

export interface RadarResult {
  available: boolean;
  count: number;
  places: Place[];             // Filtrés par le Vigile
}

/**
 * Interroge le provider, filtre via le Vigile, retourne la disponibilité.
 *
 * En cas d'erreur (réseau, API), retourne gracieusement available=false.
 */
export async function checkAvailability(
  provider: IActivityProvider,
  vigile: FilterCriteria,
  criteria: SearchCriteria,
): Promise<RadarResult> {
  try {
    const rawPlaces = await provider.search(criteria);
    const filteredPlaces = filterPlaces(rawPlaces, vigile);
    return {
      available: filteredPlaces.length > 0,
      count: filteredPlaces.length,
      places: filteredPlaces,
    };
  } catch {
    return {
      available: false,
      count: 0,
      places: [],
    };
  }
}
