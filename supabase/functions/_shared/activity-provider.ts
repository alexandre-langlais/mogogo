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

/**
 * Adaptateur Google Places API (Nearby Search).
 * Utilise la clé serveur GOOGLE_PLACES_API_KEY.
 */
export class GooglePlacesAdapter implements IActivityProvider {
  constructor(private apiKey: string) {}

  async search(criteria: SearchCriteria): Promise<Place[]> {
    const allPlaces: Place[] = [];

    // Google Nearby Search ne supporte qu'un seul type à la fois,
    // on fait des requêtes parallèles pour chaque type.
    const requests = criteria.types.map(async (type) => {
      const url = new URL("https://maps.googleapis.com/maps/api/place/nearbysearch/json");
      url.searchParams.set("location", `${criteria.location.lat},${criteria.location.lng}`);
      url.searchParams.set("radius", String(criteria.radius));
      url.searchParams.set("type", type);
      url.searchParams.set("key", this.apiKey);
      if (criteria.language) {
        url.searchParams.set("language", criteria.language);
      }

      const resp = await fetch(url.toString());
      if (!resp.ok) {
        console.warn(`Google Places API ${resp.status} for type=${type}`);
        return [];
      }

      const data = await resp.json();
      if (data.status !== "OK" && data.status !== "ZERO_RESULTS") {
        console.warn(`Google Places API status=${data.status} for type=${type}`);
        return [];
      }

      return (data.results ?? []) as Place[];
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
