import { Linking, Platform } from "react-native";
import type { Action, ActionType } from "@/types";

export function openGoogleMapsSearch(
  query: string,
  location?: { latitude: number; longitude: number },
) {
  let url = `https://www.google.com/maps/search/${encodeURIComponent(query)}`;

  if (location) {
    url += `/@${location.latitude},${location.longitude},14z`;
  }

  Linking.openURL(url);
}

/**
 * Schemes natifs des apps de streaming.
 * On tente le scheme d'abord (ouvre l'app directement),
 * puis fallback sur l'URL web si l'app n'est pas installée.
 */
const APP_SCHEMES: Partial<Record<ActionType, (query: string) => { native: string; web: string }>> = {
  netflix: (q) => ({
    native: `nflx://www.netflix.com/search?q=${q}`,
    web: `https://www.netflix.com/search?q=${q}`,
  }),
  prime_video: (q) => ({
    native: `intent://www.primevideo.com/search?phrase=${q}#Intent;package=com.amazon.avod.thirdpartyclient;scheme=https;end`,
    web: `https://www.primevideo.com/search?phrase=${q}`,
  }),
  disney_plus: (q) => ({
    native: `disneyplus://search?q=${q}`,
    web: `https://www.disneyplus.com/search?q=${q}`,
  }),
  crunchyroll: (q) => ({
    native: `crunchyroll://search?q=${q}`,
    web: `https://www.crunchyroll.com/search?q=${q}`,
  }),
  spotify: (q) => ({
    native: `spotify://search/${q}`,
    web: `https://open.spotify.com/search/${q}`,
  }),
  deezer: (q) => ({
    native: `deezer://www.deezer.com/search/${q}`,
    web: `https://www.deezer.com/search/${q}`,
  }),
};

/** Construit l'URL web (fallback) selon le type d'action */
function buildWebUrl(action: Action, location?: { latitude: number; longitude: number }): string {
  const q = encodeURIComponent(action.query);
  switch (action.type) {
    case "maps": {
      let url = `https://www.google.com/maps/search/${q}`;
      if (location) url += `/@${location.latitude},${location.longitude},14z`;
      return url;
    }
    case "steam":
      return `https://store.steampowered.com/search/?term=${q}`;
    case "play_store":
      return `https://play.google.com/store/search?q=${q}`;
    case "youtube":
      return `https://www.youtube.com/results?search_query=${q}`;
    case "spotify":
      return `https://open.spotify.com/search/${q}`;
    case "netflix":
      return `https://www.netflix.com/search?q=${q}`;
    case "prime_video":
      return `https://www.primevideo.com/search?phrase=${q}`;
    case "disney_plus":
      return `https://www.disneyplus.com/search?q=${q}`;
    case "canal_plus":
      return `https://www.canalplus.com/recherche/${q}`;
    case "apple_tv":
      return `https://tv.apple.com/search?term=${q}`;
    case "crunchyroll":
      return `https://www.crunchyroll.com/search?q=${q}`;
    case "max":
      return `https://play.max.com/search?q=${q}`;
    case "paramount_plus":
      return `https://www.paramountplus.com/search?q=${q}`;
    case "apple_music":
      return `https://music.apple.com/search?term=${q}`;
    case "deezer":
      return `https://www.deezer.com/search/${q}`;
    case "youtube_music":
      return `https://music.youtube.com/search?q=${q}`;
    case "amazon_music":
      return `https://music.amazon.com/search/${q}`;
    case "tidal":
      return `https://listen.tidal.com/search?q=${q}`;
    case "streaming":
      return `https://www.google.com/search?q=${q}+streaming`;
    case "web":
    default:
      return `https://www.google.com/search?q=${q}`;
  }
}

/**
 * Ouvre une action en tentant d'abord le scheme natif de l'app (si connu),
 * puis fallback sur l'URL web si l'app n'est pas installée.
 */
export async function openAction(action: Action, location?: { latitude: number; longitude: number }) {
  const q = encodeURIComponent(action.query);
  const schemeBuilder = APP_SCHEMES[action.type];

  if (schemeBuilder && Platform.OS !== "web") {
    const { native, web } = schemeBuilder(q);
    try {
      await Linking.openURL(native);
      return;
    } catch {
      // App non installée → fallback web
    }
    // Fallback web
    await Linking.openURL(web);
    return;
  }

  await Linking.openURL(buildWebUrl(action, location));
}

/** Ouvre la fiche Google Maps d'un lieu via son place_id (avis, photos, horaires) */
export function openGoogleMapsPlace(placeId: string, placeName: string) {
  const url = `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(placeName)}&query_place_id=${placeId}`;
  Linking.openURL(url);
}
