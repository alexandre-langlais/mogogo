import { supabase } from "./supabase";
import type { UserStats } from "@/types";

const FALLBACK: UserStats = {
  weekly_count: 0,
  top_theme: null,
  total_sessions: 0,
  explorer_ratio: 0,
};

/** Recuperer les statistiques utilisateur via la RPC get_user_stats */
export async function fetchUserStats(): Promise<UserStats> {
  const { data, error } = await supabase.rpc("get_user_stats");
  if (error || !data) return FALLBACK;
  return data as UserStats;
}
