import { useState, useEffect, useCallback } from "react";
import {
  fetchSubscribedServices,
  updateSubscribedServices,
  VALID_SLUGS,
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

    // Optimistic toggle
    setServices((prev) => {
      const idx = prev.indexOf(slug);
      if (idx >= 0) {
        return prev.filter((s) => s !== slug);
      }
      return [...prev, slug];
    });

    // Persist
    try {
      const current = await fetchSubscribedServices();
      const idx = current.indexOf(slug);
      const updated = idx >= 0
        ? current.filter((s) => s !== slug)
        : [...current, slug];
      await updateSubscribedServices(updated);
    } catch {
      // Rollback : recharger depuis la BDD
      await load();
    }
  }, [load]);

  return { services, loading, toggle, reload: load };
}
