/**
 * Couche 2 : Le Vigile — Filtres purs (synchrone, testable)
 *
 * Filtre les lieux selon des critères : open_now, rating.
 */

import type { Place } from "./activity-provider.ts";

export interface FilterCriteria {
  requireOpenNow?: boolean;     // true par défaut en mode sortie
  minRating?: number;           // PLACES_MIN_RATING (4.0) par défaut
  requireGoodForChildren?: boolean; // famille + enfants < 12 ans
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
    // Filtre businessStatus : exclure les établissements fermés
    if (place.business_status === "CLOSED_PERMANENTLY") return false;
    if (place.business_status === "CLOSED_TEMPORARILY") return false;

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

    // Filtre goodForChildren (famille + enfants < 12 ans)
    if (criteria.requireGoodForChildren) {
      if (place.good_for_children !== true) return false;
    }

    return true;
  });
}
