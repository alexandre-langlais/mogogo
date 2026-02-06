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
export type FunnelChoice = "A" | "B" | "neither" | "any";

/** Limites de quotas par plan */
export const QUOTA_LIMITS: Record<Profile["plan"], number> = {
  free: 500,
  premium: 5000,
};
