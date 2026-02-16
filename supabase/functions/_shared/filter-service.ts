/**
 * Couche 2 : Le Vigile — Filtres purs (synchrone, testable)
 *
 * Filtre les lieux selon des critères : open_now, budget, rating.
 */

import type { Place } from "./activity-provider.ts";

export interface FilterCriteria {
  requireOpenNow?: boolean;     // true par défaut en mode sortie
  maxPriceLevel?: number;       // Mapping budget → price_level
  minRating?: number;           // PLACES_MIN_RATING (4.0) par défaut
}

/**
 * Mapping budget utilisateur → maxPriceLevel Google.
 *
 * | Budget    | maxPriceLevel |
 * |-----------|---------------|
 * | free      | 0             |
 * | budget    | 1             |
 * | standard  | 2             |
 * | luxury    | 4 (pas de filtre) |
 */
export const BUDGET_TO_PRICE_LEVEL: Record<string, number> = {
  free: 0,
  budget: 1,
  standard: 2,
  luxury: 4,
};

/**
 * Filtre une liste de places selon les critères donnés.
 *
 * Règles de permissivité :
 * - Si opening_hours absent → gardé (donnée manquante = permissif)
 * - Si price_level absent → gardé
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

    // Filtre price_level
    if (criteria.maxPriceLevel !== undefined) {
      if (place.price_level !== undefined && place.price_level > criteria.maxPriceLevel) {
        return false;
      }
      // Si price_level absent → gardé (permissif)
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
