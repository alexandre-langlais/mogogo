import { useState, useEffect, useCallback } from "react";
import * as Location from "expo-location";
import i18n from "@/i18n";

interface LocationState {
  latitude: number;
  longitude: number;
}

/** Vérifie la permission sans la demander. Retourne true si déjà granted. */
export async function checkLocationPermission(): Promise<boolean> {
  const { status } = await Location.getForegroundPermissionsAsync();
  return status === "granted";
}

/** Demande la permission et retourne true si accordée. */
export async function requestLocationPermission(): Promise<boolean> {
  const { status } = await Location.requestForegroundPermissionsAsync();
  return status === "granted";
}

export function useLocation() {
  const [location, setLocation] = useState<LocationState | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;

    (async () => {
      try {
        const { status } = await Location.requestForegroundPermissionsAsync();
        if (status !== "granted") {
          setError(i18n.t("permissions.locationDenied"));
          setLoading(false);
          return;
        }

        const position = await Location.getCurrentPositionAsync({
          accuracy: Location.Accuracy.Balanced,
        });

        if (!cancelled) {
          setLocation({
            latitude: position.coords.latitude,
            longitude: position.coords.longitude,
          });
        }
      } catch (e: any) {
        if (!cancelled) {
          setError(e.message ?? i18n.t("permissions.locationError"));
        }
      } finally {
        if (!cancelled) {
          setLoading(false);
        }
      }
    })();

    return () => {
      cancelled = true;
    };
  }, []);

  /** Rafraîchit la position (utile après avoir obtenu la permission on-demand). */
  const refreshLocation = useCallback(async () => {
    try {
      setLoading(true);
      const position = await Location.getCurrentPositionAsync({
        accuracy: Location.Accuracy.Balanced,
      });
      setLocation({
        latitude: position.coords.latitude,
        longitude: position.coords.longitude,
      });
      setError(null);
    } catch (e: any) {
      setError(e.message ?? i18n.t("permissions.locationError"));
    } finally {
      setLoading(false);
    }
  }, []);

  return { location, loading, error, refreshLocation };
}
