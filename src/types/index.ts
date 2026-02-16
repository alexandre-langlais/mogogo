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
  requests_count: number;
  last_reset_date: string;
  updated_at: string;
}

/** Choix utilisateur dans l'entonnoir */
export type FunnelChoice = "A" | "B" | "neither" | "any" | "reroll" | "refine" | "finalize";

// ── V3 Types ──────────────────────────────────────────────────────────

/** Phases du funnel V3 */
export type FunnelPhase = "theme_duel" | "drill_down" | "result";

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
}

/** Limites de quotas par plan */
export const QUOTA_LIMITS: Record<Profile["plan"], number> = {
  free: 500,
  premium: 5000,
};
