/**
 * Logique pure out-home pour tests unitaires.
 *
 * Miroir des types serveur + fonctions de navigation locale
 * dans le pool de dichotomie (zero I/O, zero dependance Deno).
 */

// ── Types (mirror client/serveur) ──────────────────────────────────────

export type ActivitySource = "google_places" | "ticketmaster";

export interface OutdoorActivity {
  id: string;
  source: ActivitySource;
  name: string;
  themeSlug: string;
  themeEmoji: string;
  rating: number | null;
  vicinity: string;
  isOpen: boolean | null;
  coordinates: { lat: number; lng: number };
  placeTypes: string[];
  priceLevel: number | null;
}

export interface DichotomyNode {
  question: string;
  labelA: string;
  labelB: string;
  idsA: string[];
  idsB: string[];
}

export interface DichotomyPool {
  mogogo_message: string;
  duels: DichotomyNode[];
}

export interface DichotomySnapshot {
  candidateIds: string[];
  duelIndex: number;
}

// ── Place types (mirror activity-provider) ─────────────────────────────

export interface Place {
  place_id: string;
  name: string;
  types: string[];
  rating?: number;
  vicinity?: string;
  opening_hours?: { open_now?: boolean };
  price_level?: number;
  business_status?: string;
  geometry: { location: { lat: number; lng: number } };
}

export interface ThemeConfig {
  slug: string;
  name: string;
  emoji: string;
  eligibleEnvironments: string[];
  placeTypes: string[];
}

export interface FilterCriteria {
  requireOpenNow?: boolean;
  minRating?: number;
}

// ── Mapping deterministe ───────────────────────────────────────────────

export function placeToOutdoorActivity(
  place: Place,
  theme: ThemeConfig,
): OutdoorActivity | null {
  if (!place.place_id || !place.name) return null;

  return {
    id: place.place_id,
    source: "google_places",
    name: place.name,
    themeSlug: theme.slug,
    themeEmoji: theme.emoji,
    rating: place.rating ?? null,
    vicinity: place.vicinity ?? "",
    isOpen: place.opening_hours?.open_now ?? null,
    coordinates: {
      lat: place.geometry.location.lat,
      lng: place.geometry.location.lng,
    },
    placeTypes: place.types ?? [],
    priceLevel: place.price_level ?? null,
  };
}

export function getUniqueTypesWithMapping(
  themes: ThemeConfig[],
): { uniqueTypes: string[]; typeToThemes: Map<string, ThemeConfig[]> } {
  const typeToThemes = new Map<string, ThemeConfig[]>();

  for (const theme of themes) {
    for (const type of theme.placeTypes) {
      const existing = typeToThemes.get(type);
      if (existing) {
        existing.push(theme);
      } else {
        typeToThemes.set(type, [theme]);
      }
    }
  }

  return {
    uniqueTypes: [...typeToThemes.keys()],
    typeToThemes,
  };
}

export function mapAndDedup(
  places: Place[],
  typeToThemes: Map<string, ThemeConfig[]>,
): OutdoorActivity[] {
  const seen = new Set<string>();
  const result: OutdoorActivity[] = [];

  for (const place of places) {
    if (!place.place_id || seen.has(place.place_id)) continue;

    let matchedTheme: ThemeConfig | null = null;
    for (const type of place.types ?? []) {
      const themes = typeToThemes.get(type);
      if (themes && themes.length > 0) {
        matchedTheme = themes[0];
        break;
      }
    }

    if (!matchedTheme) continue;

    const activity = placeToOutdoorActivity(place, matchedTheme);
    if (activity) {
      seen.add(place.place_id);
      result.push(activity);
    }
  }

  return result;
}

export function filterPlaces(places: Place[], criteria: FilterCriteria): Place[] {
  return places.filter((place) => {
    // Exclure les établissements fermés
    if (place.business_status === "CLOSED_PERMANENTLY") return false;
    if (place.business_status === "CLOSED_TEMPORARILY") return false;

    if (criteria.requireOpenNow) {
      if (place.opening_hours?.open_now === false) return false;
    }
    if (criteria.minRating !== undefined) {
      if (place.rating !== undefined && place.rating < criteria.minRating) {
        return false;
      }
    }
    return true;
  });
}

// ── Validation du pool de dichotomie ───────────────────────────────────

export function validateDichotomyPool(
  pool: unknown,
  activityIds: string[],
): { valid: boolean; errors: string[] } {
  const errors: string[] = [];
  if (!pool || typeof pool !== "object") {
    return { valid: false, errors: ["Pool is not an object"] };
  }

  const p = pool as Record<string, unknown>;
  if (typeof p.mogogo_message !== "string") {
    errors.push("Missing mogogo_message");
  }

  if (!Array.isArray(p.duels)) {
    return { valid: false, errors: [...errors, "duels is not an array"] };
  }

  const idSet = new Set(activityIds);

  for (let i = 0; i < p.duels.length; i++) {
    const duel = p.duels[i] as Record<string, unknown>;
    if (typeof duel.question !== "string") errors.push(`duel[${i}]: missing question`);
    if (typeof duel.labelA !== "string") errors.push(`duel[${i}]: missing labelA`);
    if (typeof duel.labelB !== "string") errors.push(`duel[${i}]: missing labelB`);
    if (!Array.isArray(duel.idsA)) errors.push(`duel[${i}]: idsA is not an array`);
    if (!Array.isArray(duel.idsB)) errors.push(`duel[${i}]: idsB is not an array`);

    // Verifier que les IDs references existent
    if (Array.isArray(duel.idsA)) {
      for (const id of duel.idsA as string[]) {
        if (!idSet.has(id)) errors.push(`duel[${i}]: idsA contains unknown id "${id}"`);
      }
    }
    if (Array.isArray(duel.idsB)) {
      for (const id of duel.idsB as string[]) {
        if (!idSet.has(id)) errors.push(`duel[${i}]: idsB contains unknown id "${id}"`);
      }
    }
  }

  return { valid: errors.length === 0, errors };
}

// ── Resolution Mode routing ─────────────────────────────────────────────

export type ResolutionMode = "INSPIRATION" | "LOCATION_BASED";

/**
 * Détermine la phase après sélection d'un thème.
 * Miroir de la logique SELECT_THEME dans funnelReducer.
 */
export function getPhaseAfterThemeSelection(
  environment: string,
  resolutionMode: ResolutionMode,
): "drill_down" | "places_scan" {
  const isHome = environment === "env_home";
  const goToPlaces = !isHome && resolutionMode === "LOCATION_BASED";
  return goToPlaces ? "places_scan" : "drill_down";
}

/**
 * Détermine le resolution_mode par défaut à partir du contexte.
 * Miroir de la logique SET_CONTEXT dans funnelReducer.
 */
export function getDefaultResolutionMode(
  contextResolutionMode?: ResolutionMode,
): ResolutionMode {
  return contextResolutionMode ?? "INSPIRATION";
}

// ── Navigation locale dans le pool ─────────────────────────────────────

/**
 * Applique un choix A/B/neither et retourne les nouveaux candidats + index.
 * Skip les duels triviaux (tous les candidats dans le meme groupe).
 */
export function applyOutdoorChoice(
  candidateIds: string[],
  pool: DichotomyNode[],
  duelIndex: number,
  choice: "A" | "B" | "neither",
): { newCandidates: string[]; newIndex: number; converged: boolean } {
  if (duelIndex >= pool.length) {
    return { newCandidates: candidateIds, newIndex: duelIndex, converged: true };
  }

  const duel = pool[duelIndex];

  let newCandidates: string[];
  if (choice === "neither") {
    newCandidates = candidateIds; // pas de filtrage
  } else {
    const chosenIds = new Set(choice === "A" ? duel.idsA : duel.idsB);
    newCandidates = candidateIds.filter(id => chosenIds.has(id));
  }

  // Avancer au prochain duel NON TRIVIAL
  let newIndex = duelIndex + 1;
  while (newIndex < pool.length) {
    const nextDuel = pool[newIndex];
    const aCount = newCandidates.filter(id => nextDuel.idsA.includes(id)).length;
    const bCount = newCandidates.filter(id => nextDuel.idsB.includes(id)).length;
    if (aCount > 0 && bCount > 0) break; // duel utile
    newIndex++;
  }

  const converged = newCandidates.length <= 3 || newIndex >= pool.length;

  return { newCandidates, newIndex, converged };
}

/**
 * Restaure les candidats et l'index depuis un snapshot (backtrack).
 */
export function restoreFromSnapshot(
  snapshot: DichotomySnapshot,
): { candidateIds: string[]; duelIndex: number } {
  return {
    candidateIds: [...snapshot.candidateIds],
    duelIndex: snapshot.duelIndex,
  };
}
