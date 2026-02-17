/**
 * Couche 1 : IActivityProvider + GooglePlacesAdapter
 *
 * Interface abstraite pour la recherche de lieux, avec un adaptateur Google Places.
 */

export interface Place {
  place_id: string;
  name: string;
  types: string[];
  rating?: number;
  user_rating_count?: number;
  vicinity?: string;
  opening_hours?: { open_now?: boolean };
  price_level?: number;        // 0-4 (Google scale)
  geometry: { location: { lat: number; lng: number } };
}

export interface SearchCriteria {
  location: { lat: number; lng: number };
  radius: number;              // metres (2000-30000)
  types: string[];             // Google Place types
  language?: string;
}

export interface IActivityProvider {
  search(criteria: SearchCriteria): Promise<Place[]>;
}

// --- Mapping New API → legacy Place format ---

const PRICE_LEVEL_MAP: Record<string, number> = {
  PRICE_LEVEL_FREE: 0,
  PRICE_LEVEL_INEXPENSIVE: 1,
  PRICE_LEVEL_MODERATE: 2,
  PRICE_LEVEL_EXPENSIVE: 3,
  PRICE_LEVEL_VERY_EXPENSIVE: 4,
};

function priceLevelToNumber(level?: string): number | undefined {
  return level ? PRICE_LEVEL_MAP[level] : undefined;
}

function mapNewPlaceToLegacy(np: Record<string, any>): Place {
  return {
    place_id: np.id ?? "",
    name: np.displayName?.text ?? "",
    types: np.types ?? [],
    rating: np.rating,
    user_rating_count: np.userRatingCount,
    vicinity: np.shortFormattedAddress ?? np.formattedAddress ?? "",
    opening_hours: np.currentOpeningHours
      ? { open_now: np.currentOpeningHours.openNow ?? undefined }
      : undefined,
    price_level: priceLevelToNumber(np.priceLevel),
    geometry: {
      location: {
        lat: np.location?.latitude ?? 0,
        lng: np.location?.longitude ?? 0,
      },
    },
  };
}

/**
 * Adaptateur Google Places API (New) — Nearby Search.
 * Utilise la clé serveur GOOGLE_PLACES_API_KEY.
 */
export class GooglePlacesAdapter implements IActivityProvider {
  constructor(private apiKey: string) {}

  async search(criteria: SearchCriteria): Promise<Place[]> {
    // Basic SKU : champs légers pour le scan initial (enrichissement via Place Details pour les finalistes)
    const FIELD_MASK = [
      "places.id",
      "places.displayName",
      "places.shortFormattedAddress",
      "places.location",
      "places.types",
      "places.rating",
      "places.userRatingCount",
      "places.priceLevel",
      "places.businessStatus",
    ].join(",");

    // 1 seul appel avec tous les types
    const requestBody = {
      includedTypes: criteria.types,
      maxResultCount: 20,
      languageCode: criteria.language ?? "fr",
      locationRestriction: {
        circle: {
          center: {
            latitude: criteria.location.lat,
            longitude: criteria.location.lng,
          },
          radius: criteria.radius,
        },
      },
    };

    console.log(`[GooglePlaces] types=${criteria.types.length} request:`, JSON.stringify(requestBody));

    const resp = await fetch("https://places.googleapis.com/v1/places:searchNearby", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-Goog-Api-Key": this.apiKey,
        "X-Goog-FieldMask": FIELD_MASK,
      },
      body: JSON.stringify(requestBody),
    });

    if (!resp.ok) {
      const errBody = await resp.text();
      console.warn(`[GooglePlaces] ERROR ${resp.status}:`, errBody);
      return [];
    }

    const data = await resp.json();
    const places: Place[] = (data.places ?? []).map(mapNewPlaceToLegacy);
    console.log(`[GooglePlaces] ${places.length} places returned`);

    // Dédupliquer par place_id
    const seen = new Set<string>();
    return places.filter((p) => {
      if (seen.has(p.place_id)) return false;
      seen.add(p.place_id);
      return true;
    });
  }

  async getPlaceDetails(placeId: string, language: string): Promise<Record<string, any> | null> {
    const DETAILS_MASK = [
      "id",
      "displayName",
      "formattedAddress",
      "location",
      "types",
      "rating",
      "userRatingCount",
      "priceLevel",
      "currentOpeningHours",
      "regularOpeningHours",
      "editorialSummary",
      "websiteUri",
      "nationalPhoneNumber",
      "businessStatus",
    ].join(",");

    const resp = await fetch(
      `https://places.googleapis.com/v1/places/${placeId}`,
      {
        headers: {
          "X-Goog-Api-Key": this.apiKey,
          "X-Goog-FieldMask": DETAILS_MASK,
          "Accept-Language": language,
        },
      }
    );

    if (!resp.ok) return null;
    return resp.json();
  }
}
