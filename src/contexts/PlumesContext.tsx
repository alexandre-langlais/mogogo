import React, { createContext, useContext, useState, useCallback, useEffect, useRef } from "react";
import { getPlumesInfo, creditPlumes, claimDailyReward as claimDailyRewardRpc } from "@/services/plumes";
import { usePurchases } from "@/hooks/usePurchases";

interface PlumesContextValue {
  plumes: number | null;
  isPremium: boolean;
  dailyRewardAvailable: boolean;
  dailyRewardCountdown: string | null;
  refresh: () => Promise<void>;
  /** Crédite des plumes (avec 1 retry interne). Retourne true si le crédit a réussi. */
  creditAfterAd: (amount: number) => Promise<boolean>;
  /** Réclame le bonus quotidien. Retourne true si réussi. */
  claimDaily: () => Promise<boolean>;
}

const PlumesCtx = createContext<PlumesContextValue | null>(null);

function computeDailyRewardState(lastDailyRewardAt: string | null): {
  available: boolean;
  countdown: string | null;
} {
  if (!lastDailyRewardAt) {
    return { available: true, countdown: null };
  }

  const lastReward = new Date(lastDailyRewardAt).getTime();
  const nextReward = lastReward + 24 * 60 * 60 * 1000;
  const now = Date.now();

  if (now >= nextReward) {
    return { available: true, countdown: null };
  }

  const remaining = nextReward - now;
  const hours = Math.floor(remaining / (60 * 60 * 1000));
  const minutes = Math.floor((remaining % (60 * 60 * 1000)) / (60 * 1000));
  return {
    available: false,
    countdown: `${String(hours).padStart(2, "0")}:${String(minutes).padStart(2, "0")}`,
  };
}

export function PlumesProvider({ children }: { children: React.ReactNode }) {
  const [plumes, setPlumes] = useState<number | null>(null);
  const [devicePremium, setDevicePremium] = useState(false);
  const [dailyRewardAvailable, setDailyRewardAvailable] = useState(false);
  const [dailyRewardCountdown, setDailyRewardCountdown] = useState<string | null>(null);
  const lastDailyRewardAtRef = useRef<string | null>(null);
  const { isPremium: revenueCatPremium } = usePurchases();

  const isPremium = revenueCatPremium || devicePremium;

  const refresh = useCallback(async () => {
    if (isPremium) return;
    const info = await getPlumesInfo();
    if (info) {
      setPlumes(info.plumes);
      setDevicePremium(info.isPremium);
      lastDailyRewardAtRef.current = info.lastDailyRewardAt;
      const dailyState = computeDailyRewardState(info.lastDailyRewardAt);
      setDailyRewardAvailable(dailyState.available);
      setDailyRewardCountdown(dailyState.countdown);
    }
  }, [isPremium]);

  const creditAfterAd = useCallback(async (amount: number): Promise<boolean> => {
    const newCount = await creditPlumes(amount);
    if (newCount >= 0) {
      setPlumes(newCount);
      return true;
    }
    // Retry une fois après 1s
    await new Promise(r => setTimeout(r, 1000));
    const retry = await creditPlumes(amount);
    if (retry >= 0) {
      setPlumes(retry);
      return true;
    }
    return false;
  }, []);

  const claimDaily = useCallback(async (): Promise<boolean> => {
    const result = await claimDailyRewardRpc();
    if (result !== null) {
      setPlumes(result);
      lastDailyRewardAtRef.current = new Date().toISOString();
      setDailyRewardAvailable(false);
      const dailyState = computeDailyRewardState(lastDailyRewardAtRef.current);
      setDailyRewardCountdown(dailyState.countdown);
      return true;
    }
    return false;
  }, []);

  useEffect(() => {
    refresh();
  }, [refresh]);

  // Timer pour recalculer le countdown toutes les 60s
  useEffect(() => {
    const interval = setInterval(() => {
      const dailyState = computeDailyRewardState(lastDailyRewardAtRef.current);
      setDailyRewardAvailable(dailyState.available);
      setDailyRewardCountdown(dailyState.countdown);
    }, 60_000);

    return () => clearInterval(interval);
  }, []);

  return (
    <PlumesCtx.Provider value={{
      plumes,
      isPremium,
      dailyRewardAvailable,
      dailyRewardCountdown,
      refresh,
      creditAfterAd,
      claimDaily,
    }}>
      {children}
    </PlumesCtx.Provider>
  );
}

export function usePlumes() {
  const ctx = useContext(PlumesCtx);
  if (!ctx) {
    throw new Error("usePlumes must be used within a PlumesProvider");
  }
  return ctx;
}
