import { useState, useEffect, useCallback } from "react";
import { useAuth } from "@/hooks/useAuth";
import { useProfile } from "@/hooks/useProfile";
import {
  identifyUser,
  checkEntitlement,
  syncPlanToSupabase,
  presentPaywall,
  presentCustomerCenter,
  restorePurchases,
  onCustomerInfoChanged,
} from "@/services/purchases";

export function usePurchases() {
  const { user } = useAuth();
  const { reload: reloadProfile } = useProfile();
  const [isPremium, setIsPremium] = useState(false);
  const [loading, setLoading] = useState(true);

  // Identify + check entitlement quand le user change
  useEffect(() => {
    if (!user?.id) {
      setIsPremium(false);
      setLoading(false);
      return;
    }

    let cancelled = false;

    (async () => {
      try {
        await identifyUser(user.id);
        const premium = await checkEntitlement();
        if (cancelled) return;
        setIsPremium(premium);
        await syncPlanToSupabase(premium);
      } catch (err) {
        console.warn("[Purchases] identify/check failed:", err);
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [user?.id]);

  // Listener réactif sur les changements de CustomerInfo
  useEffect(() => {
    const unsubscribe = onCustomerInfoChanged(async (premium) => {
      setIsPremium(premium);
      try {
        await syncPlanToSupabase(premium);
        await reloadProfile();
      } catch (err) {
        console.warn("[Purchases] sync on change failed:", err);
      }
    });

    return unsubscribe;
  }, [reloadProfile]);

  const showPaywall = useCallback(async (): Promise<boolean> => {
    try {
      const purchased = await presentPaywall();
      if (purchased) {
        setIsPremium(true);
        await syncPlanToSupabase(true);
        await reloadProfile();
      }
      return purchased;
    } catch (err) {
      console.warn("[Purchases] paywall error:", err);
      return false;
    }
  }, [reloadProfile]);

  const showCustomerCenter = useCallback(async () => {
    try {
      await presentCustomerCenter();
    } catch (err) {
      console.warn("[Purchases] customer center error:", err);
    }
  }, []);

  const restore = useCallback(async (): Promise<boolean> => {
    try {
      const premium = await restorePurchases();
      setIsPremium(premium);
      await syncPlanToSupabase(premium);
      await reloadProfile();
      return premium;
    } catch (err) {
      console.warn("[Purchases] restore error:", err);
      return false;
    }
  }, [reloadProfile]);

  return { isPremium, loading, showPaywall, showCustomerCenter, restore };
}
