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
  business_status?: string;    // OPERATIONAL, CLOSED_TEMPORARILY, CLOSED_PERMANENTLY
  good_for_children?: boolean;
  geometry: { location: { lat: number; lng: number } };
}

export interface SearchCriteria {
  location: { lat: number; lng: number };
  radius: number;              // metres (2000-30000)
  types: string[];             // Google Place types
  language?: string;
  familyWithYoungChildren?: boolean; // social=family + enfants < 12 ans → ajoute goodForChildren
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
    business_status: np.businessStatus ?? undefined,
    good_for_children: np.goodForChildren ?? undefined,
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
    // Nearby Search Pro SKU — champs légers pour le scan initial
    // (enrichissement détaillé via Place Details pour les finalistes uniquement)
    const fields = [
      "places.id",                    // Pro
      "places.displayName",           // Pro
      "places.shortFormattedAddress",  // Pro
      "places.location",              // Pro
      "places.types",                 // Pro
      "places.businessStatus",        // Pro
      "places.rating",                // Enterprise
      "places.userRatingCount",       // Enterprise
      "places.priceLevel",            // Enterprise
      "places.currentOpeningHours",   // Enterprise
    ];
    // Famille avec enfants < 12 ans → ajouter goodForChildren
    if (criteria.familyWithYoungChildren) {
      fields.push("places.goodForChildren"); // Enterprise + Atmosphere
    }
    const FIELD_MASK = fields.join(",");

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
    // Place Details — mélange Essentials/Pro/Enterprise (appelé uniquement pour les 2 finalistes)
    const DETAILS_MASK = [
      "id",                     // Essentials (IDs Only)
      "displayName",            // Pro
      "formattedAddress",       // Essentials
      "location",               // Essentials
      "types",                  // Essentials
      "rating",                 // Enterprise
      "userRatingCount",        // Enterprise
      "priceLevel",             // Enterprise
      "priceRange",             // Enterprise
      "currentOpeningHours",    // Enterprise
      "regularOpeningHours",    // Enterprise
      "editorialSummary",       // Enterprise + Atmosphere
      "websiteUri",             // Enterprise
      "nationalPhoneNumber",    // Enterprise
      "businessStatus",         // Pro
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
