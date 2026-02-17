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
    vicinity: np.shortFormattedAddress,
    opening_hours: undefined,
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
    const allPlaces: Place[] = [];

    const FIELD_MASK = [
      "places.id",
      "places.displayName",
      "places.types",
      "places.rating",
      "places.shortFormattedAddress",
      "places.priceLevel",
      "places.location",
    ].join(",");

    const requests = criteria.types.map(async (type) => {
      const requestBody = {
        includedTypes: [type],
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
      console.log(`[GooglePlaces] type=${type} request:`, JSON.stringify(requestBody, null, 2));

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
        console.warn(`[GooglePlaces] ERROR ${resp.status} for type=${type}:`, errBody);
        return [];
      }

      const data = await resp.json();
      console.log(`[GooglePlaces] type=${type} raw response:`, JSON.stringify(data, null, 2));
      return (data.places ?? []).map(mapNewPlaceToLegacy);
    });

    const results = await Promise.allSettled(requests);
    for (const result of results) {
      if (result.status === "fulfilled") {
        allPlaces.push(...result.value);
      }
    }

    // Dédupliquer par place_id
    const seen = new Set<string>();
    return allPlaces.filter((p) => {
      if (seen.has(p.place_id)) return false;
      seen.add(p.place_id);
      return true;
    });
  }
}
