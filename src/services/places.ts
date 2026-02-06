import { Linking } from "react-native";
import type { Action } from "@/types";

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

/** Construit l'URL à ouvrir selon le type d'action */
function buildActionUrl(action: Action, location?: { latitude: number; longitude: number }): string {
  const q = encodeURIComponent(action.query);
  switch (action.type) {
    case "maps": {
      let url = `https://www.google.com/maps/search/${q}`;
      if (location) url += `/@${location.latitude},${location.longitude},14z`;
      return url;
    }
    case "steam":
      return `https://store.steampowered.com/search/?term=${q}`;
    case "app_store":
      return `https://apps.apple.com/search?term=${q}`;
    case "play_store":
      return `https://play.google.com/store/search?q=${q}`;
    case "youtube":
      return `https://www.youtube.com/results?search_query=${q}`;
    case "streaming":
      return `https://www.google.com/search?q=${q}+streaming`;
    case "spotify":
      return `https://open.spotify.com/search/${q}`;
    case "web":
    default:
      return `https://www.google.com/search?q=${q}`;
  }
}

/** Ouvre une action dans le navigateur/app approprié */
export function openAction(action: Action, location?: { latitude: number; longitude: number }) {
  Linking.openURL(buildActionUrl(action, location));
}
