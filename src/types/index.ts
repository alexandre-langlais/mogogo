/** Type d'action proposée avec la recommandation */
export type ActionType =
  | "maps"
  | "web"
  | "steam"
  | "play_store"
  | "youtube"
  | "streaming"
  | "spotify";

/** Action concrète que l'utilisateur peut lancer */
export interface Action {
  type: ActionType;
  label: string;
  query: string;
}

/** Réponse du LLM — contrat JSON strict (section 7 des specs) */
export interface LLMResponse {
  statut: "en_cours" | "finalisé" | "épuisé";
  phase: "questionnement" | "pivot" | "breakout" | "resultat";
  mogogo_message: string;
  question?: string;
  subcategories?: string[];
  subcategory_emojis?: string[];
  options?: {
    A: string;
    B: string;
  };
  recommandation_finale?: {
    titre: string;
    explication: string;
    justification?: string;
    google_maps_query?: string;
    actions: Action[];
    tags?: string[];
  };
  metadata: {
    pivot_count: number;
    current_branch: string;
    depth?: number;
  };
  /** Injected by Edge Function: which model answered this response */
  _model_used?: string;
  /** Injected by Edge Function: token usage for this call */
  _usage?: { prompt_tokens: number; completion_tokens: number; total_tokens: number };
  /** Injected by Edge Function: true si le LLM est autorisé à finaliser au prochain choix */
  _next_may_finalize?: boolean;
}

/** Contexte utilisateur envoyé au LLM */
export interface UserContext {
  social: string;
  environment: string;
  location?: {
    latitude: number;
    longitude: number;
  };
  language?: string;
  children_ages?: { min: number; max: number };
}

/** Profil utilisateur stocké dans Supabase */
export interface Profile {
  id: string;
  full_name: string | null;
  plan: "free" | "premium";
  updated_at: string;
  subscribed_services?: string[];
}

/** Choix utilisateur dans l'entonnoir */
export type FunnelChoice = "A" | "B" | "neither" | "any" | "reroll" | "refine" | "finalize";

// ── V3 Types ──────────────────────────────────────────────────────────

/** Mode de résolution : INSPIRATION (gratuit, pas de Places) ou LOCATION_BASED (premium, Google Places) */
export type ResolutionMode = "INSPIRATION" | "LOCATION_BASED";

/** Phases du funnel V3 */
export type FunnelPhase = "theme_duel" | "drill_down" | "result" | "places_scan" | "outdoor_drill";

// ── Out-Home Types ──────────────────────────────────────────────────────

export type ActivitySource = "google_places" | "ticketmaster";

export interface OutdoorActivity {
  id: string;
  source: ActivitySource;
  name: string;
  themeSlug: string;
  themeEmoji: string;
  rating: number | null;
  userRatingCount: number | null;
  vicinity: string;
  formattedAddress: string;
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
  mogogoDescription?: string;
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

/** Choix utilisateur V3 */
export type FunnelChoiceV3 = "A" | "B" | "neither" | "restart";

/** Duel de thèmes (Phase 2) */
export interface ThemeDuel {
  themeA: { slug: string; emoji: string; label: string };
  themeB: { slug: string; emoji: string; label: string };
}

/** Contexte utilisateur enrichi V3 */
export interface UserContextV3 extends UserContext {
  search_radius?: number;          // metres (2000-30000), absent si env_home
  user_hint?: string;              // Q0 "Coup de Pouce" texte libre
  user_hint_tags?: string[];       // Q0 tags sélectionnés
  datetime?: string;               // ISO 8601, heure locale
  resolution_mode?: ResolutionMode; // INSPIRATION (défaut) ou LOCATION_BASED (premium)
}

/** Entrée dans l'historique du funnel */
export interface FunnelHistoryEntry {
  response: LLMResponse;
  choice?: FunnelChoice;
  choiceLabel?: string;
}

/** Preference utilisateur stockee dans Supabase (table user_preferences) */
export interface UserPreference {
  id: string;
  user_id: string;
  tag_slug: string;
  score: number;
  updated_at: string;
}

/** Affichage d'un tag thematique */
export interface TagDisplay {
  slug: string;
  emoji: string;
  labelKey: string;
}

/** Métadonnées d'une activité outdoor (Google Places) sauvegardée dans l'historique */
export interface ActivityMetadata {
  placeId?: string;
  rating?: number;
  userRatingCount?: number;
  priceLevel?: number;
  priceRange?: { startPrice?: { units: string; currencyCode: string }; endPrice?: { units: string; currencyCode: string } };
  address?: string;
  editorialSummary?: string;
  isOpen?: boolean;
  openingHoursText?: string[];
  themeEmoji?: string;
  phoneNumber?: string;
  websiteUri?: string;
}

/** Sample d'activite communautaire (table activity_samples) */
export interface ActivitySample {
  id: string;
  title: string;
  description: string;
  theme: string;
  environment: string;
  social_context: string;
  created_at: string;
}

/** Statistiques utilisateur pour le widget dashboard */
export interface UserStats {
  weekly_count: number;
  top_theme: string | null;
  total_sessions: number;
  explorer_ratio: number;
}

/** Session sauvegardee dans l'historique */
export interface SessionHistory {
  id: string;
  user_id: string;
  created_at: string;
  activity_title: string;
  activity_description: string;
  activity_tags: string[];
  context_snapshot: UserContext;
  action_links: Action[];
  session_id?: string;
  activity_metadata?: ActivityMetadata;
}

