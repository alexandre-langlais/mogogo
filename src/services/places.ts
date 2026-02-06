import { Linking } from "react-native";

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
