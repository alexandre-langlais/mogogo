import { useState, useEffect, useCallback } from "react";
import {
  fetchSubscribedServices,
  updateSubscribedServices,
  VALID_SLUGS,
  MAX_SERVICES_PER_CATEGORY,
  getCategoryForSlug,
  SERVICES_CATALOG,
} from "@/services/subscriptions";

export function useSubscriptions() {
  const [services, setServices] = useState<string[]>([]);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    try {
      setLoading(true);
      const data = await fetchSubscribedServices();
      setServices(data);
    } catch {
      // Silencieux — on garde la liste vide
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const toggle = useCallback(async (slug: string) => {
    if (!VALID_SLUGS.has(slug)) return;

    // Vérifier la limite avant toggle on
    setServices((prev) => {
      const idx = prev.indexOf(slug);
      if (idx >= 0) {
        // Toggle off — toujours permis
        return prev.filter((s) => s !== slug);
      }
      // Toggle on — vérifier la limite par catégorie
      const category = getCategoryForSlug(slug);
      if (category) {
        const slugsInCategory = category === "video"
          ? new Set(SERVICES_CATALOG.video.map((s) => s.slug))
          : new Set(SERVICES_CATALOG.music.map((s) => s.slug));
        const countInCategory = prev.filter((s) => slugsInCategory.has(s)).length;
        if (countInCategory >= MAX_SERVICES_PER_CATEGORY) {
          return prev; // Limite atteinte, pas de changement
        }
      }
      return [...prev, slug];
    });

    // Persist
    try {
      const current = await fetchSubscribedServices();
      const idx = current.indexOf(slug);
      if (idx >= 0) {
        // Toggle off
        const updated = current.filter((s) => s !== slug);
        await updateSubscribedServices(updated);
      } else {
        // Toggle on — vérifier la limite côté serveur aussi
        const category = getCategoryForSlug(slug);
        if (category) {
          const slugsInCategory = category === "video"
            ? new Set(SERVICES_CATALOG.video.map((s) => s.slug))
            : new Set(SERVICES_CATALOG.music.map((s) => s.slug));
          const countInCategory = current.filter((s) => slugsInCategory.has(s)).length;
          if (countInCategory >= MAX_SERVICES_PER_CATEGORY) {
            await load(); // Rollback l'optimistic update
            return;
          }
        }
        await updateSubscribedServices([...current, slug]);
      }
    } catch {
      // Rollback : recharger depuis la BDD
      await load();
    }
  }, [load]);

  /** Nombre de services dans une catégorie */
  const countInCategory = useCallback((category: "video" | "music"): number => {
    const slugsInCategory = category === "video"
      ? new Set(SERVICES_CATALOG.video.map((s) => s.slug))
      : new Set(SERVICES_CATALOG.music.map((s) => s.slug));
    return services.filter((s) => slugsInCategory.has(s)).length;
  }, [services]);

  return { services, loading, toggle, reload: load, countInCategory };
}
