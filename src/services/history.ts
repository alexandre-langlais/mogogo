import { supabase } from "./supabase";
import { getDeviceId } from "./deviceId";
import type { Action, SessionHistory, UserContext } from "@/types";

const PAGE_SIZE = 20;

export interface SaveSessionParams {
  title: string;
  description: string;
  tags: string[];
  context: UserContext;
  actions: Action[];
  session_id?: string;
}

/** Sauvegarder une session validee dans l'historique */
export async function saveSession(params: SaveSessionParams): Promise<void> {
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) throw new Error("Not authenticated");

  const { error } = await supabase
    .from("sessions_history")
    .insert({
      user_id: user.id,
      activity_title: params.title,
      activity_description: params.description,
      activity_tags: params.tags,
      context_snapshot: params.context,
      action_links: params.actions,
      session_id: params.session_id ?? null,
    });

  if (error) throw new Error(error.message);
}

/** Recuperer l'historique pagine (20 items par page) */
export async function fetchHistory(page: number): Promise<SessionHistory[]> {
  const from = page * PAGE_SIZE;
  const to = from + PAGE_SIZE - 1;

  const { data, error } = await supabase
    .from("sessions_history")
    .select("*")
    .order("created_at", { ascending: false })
    .range(from, to);

  if (error) throw new Error(error.message);
  return data ?? [];
}

/** Recuperer une session par ID */
export async function fetchSessionById(id: string): Promise<SessionHistory | null> {
  const { data, error } = await supabase
    .from("sessions_history")
    .select("*")
    .eq("id", id)
    .single();

  if (error) {
    if (error.code === "PGRST116") return null; // Not found
    throw new Error(error.message);
  }
  return data;
}

/** Compter le nombre de sessions validees pour le user courant */
export async function countSessions(): Promise<number> {
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return 0;

  const { count, error } = await supabase
    .from("sessions_history")
    .select("*", { count: "exact", head: true })
    .eq("user_id", user.id);

  if (error) return 0;
  return count ?? 0;
}

/** Supprimer une session de l'historique */
export async function deleteSession(id: string): Promise<void> {
  const { error } = await supabase
    .from("sessions_history")
    .delete()
    .eq("id", id);

  if (error) throw new Error(error.message);
}

/** Catalogue des codes magiques : { CODE: bonus_sessions } */
const PROMO_CODES: Record<string, number> = {
  THANKYOU: 5,
};

/** Résultat d'un code promo : bonus de plumes ou passage premium */
export type PromoResult = { type: "plumes"; bonus: number } | { type: "premium" };

/** Utiliser un code promo. Retourne le résultat, ou lance une erreur. */
export async function redeemPromoCode(code: string): Promise<PromoResult> {
  const normalized = code.trim().toUpperCase();
  const deviceId = await getDeviceId();
  if (!deviceId) throw new Error("no_device_id");

  // Code sessions (catalogue hardcodé)
  const bonus = PROMO_CODES[normalized];
  if (bonus) {
    const { data, error } = await supabase.rpc("redeem_promo_code", {
      p_device_id: deviceId,
      p_code: normalized,
      p_bonus: bonus,
    });

    if (error) throw new Error("server_error");
    if (data === "too_many_attempts") throw new Error("too_many_attempts");
    if (data === "already_redeemed") throw new Error("already_redeemed");

    return { type: "plumes", bonus };
  }

  // Code premium (vérifié en BDD via premium_codes)
  const { data, error } = await supabase.rpc("redeem_premium_code", {
    p_device_id: deviceId,
    p_code: normalized,
  });

  if (error) throw new Error("server_error");
  if (data === "too_many_attempts") throw new Error("too_many_attempts");
  if (data === "not_found") throw new Error("invalid_code");
  if (data === "already_redeemed") throw new Error("already_redeemed");

  return { type: "premium" };
}
