import { Platform } from "react-native";
import * as Application from "expo-application";

/**
 * Retourne un identifiant stable du device physique.
 * - Android : androidId (persiste across reinstall)
 * - iOS : identifierForVendor (reset si toutes les apps du vendor sont désinstallées)
 */
export async function getDeviceId(): Promise<string | null> {
  if (Platform.OS === "android") {
    return Application.getAndroidId();
  }
  if (Platform.OS === "ios") {
    return Application.getIosIdForVendorAsync();
  }
  return null;
}
