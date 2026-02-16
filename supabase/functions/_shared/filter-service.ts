/**
 * Couche 2 : Le Vigile — Filtres purs (synchrone, testable)
 *
 * Filtre les lieux selon des critères : open_now, rating.
 */

import type { Place } from "./activity-provider.ts";

export interface FilterCriteria {
  requireOpenNow?: boolean;     // true par défaut en mode sortie
  minRating?: number;           // PLACES_MIN_RATING (4.0) par défaut
}

/**
 * Filtre une liste de places selon les critères donnés.
 *
 * Règles de permissivité :
 * - Si opening_hours absent → gardé (donnée manquante = permissif)
 * - Si rating absent → gardé
 * - rating est inclusive (>= minRating)
 */
export function filterPlaces(places: Place[], criteria: FilterCriteria): Place[] {
  return places.filter((place) => {
    // Filtre open_now
    if (criteria.requireOpenNow) {
      if (place.opening_hours?.open_now === false) return false;
      // Si opening_hours absent ou open_now absent → gardé (permissif)
    }

    // Filtre rating
    if (criteria.minRating !== undefined) {
      if (place.rating !== undefined && place.rating < criteria.minRating) {
        return false;
      }
      // Si rating absent → gardé (permissif)
    }

    return true;
  });
}
