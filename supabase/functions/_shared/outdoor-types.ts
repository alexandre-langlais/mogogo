/**
 * Types pour le flow out-home (env_shelter + env_open_air).
 *
 * Scan Google Places → mapping vers OutdoorActivity → pool de dichotomie LLM → navigation locale.
 */

export type ActivitySource = "google_places" | "ticketmaster";

export interface OutdoorActivity {
  id: string;                   // place_id Google (ou event_id Ticketmaster)
  source: ActivitySource;
  name: string;
  themeSlug: string;            // slug du theme source
  themeEmoji: string;
  rating: number | null;
  userRatingCount: number | null;
  vicinity: string;             // adresse courte
  formattedAddress: string;     // adresse complète
  isOpen: boolean | null;
  coordinates: { lat: number; lng: number };
  placeTypes: string[];
  priceLevel: number | null;
  priceRange?: { startPrice?: { units: string; currencyCode: string }; endPrice?: { units: string; currencyCode: string } };
  goodForChildren?: boolean;
  editorialSummary?: string;
  openingHoursText?: string[];
  websiteUri?: string;
  phoneNumber?: string;
  primaryTypeDisplayName?: string;
  mogogoDescription?: string;
}

/** Noeud de dichotomie : une question binaire qui partitionne les activites */
export interface DichotomyNode {
  question: string;             // "Tu preferes..."
  labelA: string;               // ex: "Manger un bon repas"
  labelB: string;               // ex: "Bouger et te depenser"
  idsA: string[];               // IDs des activites du groupe A
  idsB: string[];               // IDs des activites du groupe B
}

/** Pool complet retourne par le LLM */
export interface DichotomyPool {
  mogogo_message: string;
  duels: DichotomyNode[];
}

/** Snapshot pour le backtrack */
export interface DichotomySnapshot {
  candidateIds: string[];
  duelIndex: number;
}
