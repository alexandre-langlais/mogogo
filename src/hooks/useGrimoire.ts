import { useState, useEffect, useCallback } from "react";
import { DEFAULT_TAG_SLUGS } from "@/constants/tags";
import {
  fetchPreferences,
  addTag as addTagService,
  removeTag as removeTagService,
  boostTags as boostTagsService,
  penalizeTags as penalizeTagsService,
  updateScore as updateScoreService,
  initializeDefaultTags,
} from "@/services/grimoire";
import type { UserPreference } from "@/types";

export function useGrimoire() {
  const [preferences, setPreferences] = useState<UserPreference[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async (silent = false) => {
    try {
      if (!silent) setLoading(true);
      setError(null);
      let prefs = await fetchPreferences();

      // Auto-init si vide
      if (prefs.length === 0) {
        await initializeDefaultTags(DEFAULT_TAG_SLUGS);
        prefs = await fetchPreferences();
      }

      setPreferences(prefs);
    } catch (e: any) {
      setError(e.message ?? "Unknown error");
    } finally {
      if (!silent) setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const addTag = useCallback(async (slug: string) => {
    try {
      await addTagService(slug);
      await load(true);
    } catch (e: any) {
      setError(e.message);
    }
  }, [load]);

  const removeTag = useCallback(async (slug: string) => {
    try {
      await removeTagService(slug);
      await load(true);
    } catch (e: any) {
      setError(e.message);
    }
  }, [load]);

  const boostTags = useCallback(async (slugs: string[]) => {
    try {
      await boostTagsService(slugs);
      // Pas besoin de reload ici, c'est un background boost
    } catch {
      // Silencieux pour le boost en background
    }
  }, []);

  const penalizeTags = useCallback(async (slugs: string[]) => {
    try {
      await penalizeTagsService(slugs);
    } catch {
      // Silencieux pour la pénalité en background
    }
  }, []);

  const updateScore = useCallback(async (slug: string, score: number) => {
    try {
      await updateScoreService(slug, score);
      await load(true);
    } catch (e: any) {
      setError(e.message);
    }
  }, [load]);

  return { preferences, loading, error, addTag, removeTag, boostTags, penalizeTags, updateScore, reload: load };
}
