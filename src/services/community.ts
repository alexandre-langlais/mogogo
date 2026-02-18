import { supabase } from "./supabase";
import type { ActivitySample } from "@/types";

/** Shuffle Fisher-Yates in-place */
function shuffle<T>(arr: T[]): T[] {
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
  return arr;
}

/**
 * Recupere des suggestions communautaires depuis activity_samples.
 * Filtre par themes si fournis, sinon toutes les entrees.
 * Fetch limit*3, shuffle client-side, slice limit.
 */
export async function getCommunitySuggestions(
  userThemes: string[] = [],
  limit = 10,
): Promise<ActivitySample[]> {
  let query = supabase
    .from("activity_samples")
    .select("*")
    .order("created_at", { ascending: false })
    .limit(limit * 3);

  if (userThemes.length > 0) {
    query = query.in("theme", userThemes);
  }

  const { data, error } = await query;
  if (error) throw new Error(error.message);
  if (!data || data.length === 0) return [];

  return shuffle(data).slice(0, limit);
}
