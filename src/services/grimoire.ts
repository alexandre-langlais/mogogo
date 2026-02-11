import { supabase } from "./supabase";
import { getTagDisplay } from "@/constants/tags";
import type { UserPreference } from "@/types";

/** Lire toutes les preferences de l'utilisateur connecte, triees par score desc */
export async function fetchPreferences(): Promise<UserPreference[]> {
  const { data, error } = await supabase
    .from("user_preferences")
    .select("*")
    .order("score", { ascending: false });

  if (error) throw new Error(error.message);
  return data ?? [];
}

/** Ajouter un tag avec score initial 10, ou le reactiver s'il existait */
export async function addTag(slug: string): Promise<void> {
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) throw new Error("Not authenticated");

  const { error } = await supabase
    .from("user_preferences")
    .upsert(
      { user_id: user.id, tag_slug: slug, score: 10, updated_at: new Date().toISOString() },
      { onConflict: "user_id,tag_slug" },
    );

  if (error) throw new Error(error.message);
}

/** Supprimer un tag */
export async function removeTag(slug: string): Promise<void> {
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) throw new Error("Not authenticated");

  const { error } = await supabase
    .from("user_preferences")
    .delete()
    .eq("user_id", user.id)
    .eq("tag_slug", slug);

  if (error) throw new Error(error.message);
}

/** Booster les tags donnes de +10, cap a 100 */
export async function boostTags(slugs: string[]): Promise<void> {
  if (slugs.length === 0) return;

  const { data: { user } } = await supabase.auth.getUser();
  if (!user) throw new Error("Not authenticated");

  // Lire les scores actuels
  const { data: existing } = await supabase
    .from("user_preferences")
    .select("tag_slug, score")
    .eq("user_id", user.id)
    .in("tag_slug", slugs);

  const existingMap = new Map((existing ?? []).map((p) => [p.tag_slug, p.score as number]));

  const rows = slugs.map((slug) => ({
    user_id: user.id,
    tag_slug: slug,
    score: Math.min(100, (existingMap.get(slug) ?? 0) + 10),
    updated_at: new Date().toISOString(),
  }));

  const { error } = await supabase
    .from("user_preferences")
    .upsert(rows, { onConflict: "user_id,tag_slug" });

  if (error) throw new Error(error.message);
}

/** Penaliser les tags donnes de -5, plancher a 0 (ne penalise que les tags existants) */
export async function penalizeTags(slugs: string[]): Promise<void> {
  const unique = [...new Set(slugs)];
  if (unique.length === 0) return;

  const { data: { user } } = await supabase.auth.getUser();
  if (!user) throw new Error("Not authenticated");

  // Lire les scores actuels (on ne penalise que les tags existants)
  const { data: existing } = await supabase
    .from("user_preferences")
    .select("tag_slug, score")
    .eq("user_id", user.id)
    .in("tag_slug", unique);

  if (!existing || existing.length === 0) return;

  const rows = existing.map((p) => ({
    user_id: user.id,
    tag_slug: p.tag_slug,
    score: Math.max(0, (p.score as number) - 5),
    updated_at: new Date().toISOString(),
  }));

  const { error } = await supabase
    .from("user_preferences")
    .upsert(rows, { onConflict: "user_id,tag_slug" });

  if (error) throw new Error(error.message);
}

/** Mettre a jour manuellement le score d'un tag (clamp 0-100) */
export async function updateScore(slug: string, score: number): Promise<void> {
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) throw new Error("Not authenticated");

  const clamped = Math.max(0, Math.min(100, Math.round(score)));
  const { error } = await supabase
    .from("user_preferences")
    .update({ score: clamped, updated_at: new Date().toISOString() })
    .eq("user_id", user.id)
    .eq("tag_slug", slug);

  if (error) throw new Error(error.message);
}

/** Initialiser les tags par defaut avec score 5 (ne touche pas les existants) */
export async function initializeDefaultTags(slugs: string[]): Promise<void> {
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) throw new Error("Not authenticated");

  const rows = slugs.map((slug) => ({
    user_id: user.id,
    tag_slug: slug,
    score: 5,
    updated_at: new Date().toISOString(),
  }));

  // ignoreDuplicates : ne pas ecraser les tags existants
  const { error } = await supabase
    .from("user_preferences")
    .upsert(rows, { onConflict: "user_id,tag_slug", ignoreDuplicates: true });

  if (error) throw new Error(error.message);
}

/** Formater les preferences en texte lisible pour le prompt LLM */
export function formatPreferencesForLLM(prefs: UserPreference[]): string {
  if (prefs.length === 0) return "";

  const lines = prefs.map((p) => {
    const display = getTagDisplay(p.tag_slug);
    return `${display.emoji} ${p.tag_slug}: ${p.score}/100`;
  });

  return `Preferences thematiques de l'utilisateur (oriente tes suggestions sans overrider le contexte) :\n${lines.join(", ")}`;
}
