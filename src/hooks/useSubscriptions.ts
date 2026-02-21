import { useState, useEffect, useCallback, useRef } from "react";
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

  // ── Race condition guard ──────────────────────────────────────────────
  // Compteur d'époque : incrémenté au DÉBUT et à la FIN de chaque toggle persist.
  // Époque paire = aucun persist en cours. Époque impaire = persist en vol.
  // load() capture l'époque au début du fetch et n'applique le résultat que si
  // aucun toggle ne s'est produit entre-temps (époque inchangée + paire).
  const toggleEpochRef = useRef(0);

  const load = useCallback(async () => {
    const epochAtStart = toggleEpochRef.current;
    try {
      setLoading(true);
      const data = await fetchSubscribedServices();
      // N'appliquer que si aucun toggle n'a démarré ou terminé depuis le début du fetch.
      // Cela évite d'écraser une mise à jour optimiste avec des données stale de la DB.
      if (toggleEpochRef.current === epochAtStart && epochAtStart % 2 === 0) {
        setServices(data);
      }
    } catch {
      // Silencieux — on garde la liste courante
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const toggle = useCallback(async (slug: string) => {
    if (!VALID_SLUGS.has(slug)) return;

    // Marquer le début du toggle (époque impaire = persist en vol)
    toggleEpochRef.current++;

    // Mise à jour optimiste
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
            // Marquer fin du toggle (époque paire) puis rollback
            toggleEpochRef.current++;
            await load();
            return;
          }
        }
        await updateSubscribedServices([...current, slug]);
      }
      // Persist réussi : marquer fin du toggle (époque paire)
      toggleEpochRef.current++;
    } catch {
      // Marquer fin du toggle (époque paire) puis rollback
      toggleEpochRef.current++;
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
