import { useState, useEffect, useCallback } from "react";
import { supabase } from "@/services/supabase";
import type { Profile } from "@/types";

export function useProfile() {
  const [profile, setProfile] = useState<Profile | null>(null);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    try {
      setLoading(true);
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;

      const { data } = await supabase
        .from("profiles")
        .select("*")
        .eq("id", user.id)
        .single();

      if (data) setProfile(data as Profile);
    } catch {
      // Silencieux — le profil est non-critique pour l'affichage
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  // Solde effectif : tient compte du refill journalier et du plan premium
  const plumes = (() => {
    if (!profile) return 0;
    if (profile.plan === "premium") return Infinity;
    const today = new Date().toISOString().split("T")[0];
    if (profile.last_refill_date < today) return 5; // sera refill au prochain appel serveur
    return profile.plumes_balance;
  })();

  return { profile, plumes, loading, reload: load };
}
