/** Type d'action proposée avec la recommandation */
export type ActionType =
  | "maps"
  | "web"
  | "steam"
  | "app_store"
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
  statut: "en_cours" | "finalisé";
  phase: "questionnement" | "pivot" | "breakout" | "resultat";
  mogogo_message: string;
  question?: string;
  options?: {
    A: string;
    B: string;
  };
  recommandation_finale?: {
    titre: string;
    explication: string;
    google_maps_query?: string;
    actions: Action[];
    tags?: string[];
  };
  metadata: {
    pivot_count: number;
    current_branch: string;
  };
}

/** Contexte utilisateur envoyé au LLM */
export interface UserContext {
  social: string;
  energy: number;
  budget: string;
  environment: string;
  location?: {
    latitude: number;
    longitude: number;
  };
  timing?: string;
  language?: string;
}

/** Profil utilisateur stocké dans Supabase */
export interface Profile {
  id: string;
  full_name: string | null;
  plan: "free" | "premium";
  requests_count: number;
  last_reset_date: string;
  plumes_balance: number;
  last_refill_date: string;
  updated_at: string;
}

/** Choix utilisateur dans l'entonnoir */
export type FunnelChoice = "A" | "B" | "neither" | "any" | "reroll" | "refine";

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
}

/** Limites de quotas par plan */
export const QUOTA_LIMITS: Record<Profile["plan"], number> = {
  free: 500,
  premium: 5000,
};
