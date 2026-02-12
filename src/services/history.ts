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

/** Compter les sessions via device_id (anti-fraude). Fallback vers countSessions() sur web. */
export async function countDeviceSessions(): Promise<number> {
  const deviceId = await getDeviceId();
  if (!deviceId) return countSessions();

  const { data, error } = await supabase
    .from("device_sessions")
    .select("session_count")
    .eq("device_id", deviceId)
    .single();

  if (error) {
    if (error.code === "PGRST116") return 0; // Not found
    return 0;
  }
  return data?.session_count ?? 0;
}

/** Supprimer une session de l'historique */
export async function deleteSession(id: string): Promise<void> {
  const { error } = await supabase
    .from("sessions_history")
    .delete()
    .eq("id", id);

  if (error) throw new Error(error.message);
}
