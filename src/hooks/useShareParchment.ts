import { useCallback, useRef, useState } from "react";
import { Platform } from "react-native";
import type ViewShot from "react-native-view-shot";
import * as Sharing from "expo-sharing";
import * as FileSystem from "expo-file-system";

export function useShareParchment(title: string) {
  const viewShotRef = useRef<ViewShot>(null);
  const [sharing, setSharing] = useState(false);

  const share = useCallback(async () => {
    if (!viewShotRef.current?.capture) return;

    setSharing(true);
    try {
      const uri = await viewShotRef.current.capture();

      if (Platform.OS === "web") {
        await shareWeb(uri, title);
      } else {
        await Sharing.shareAsync(uri, {
          mimeType: "image/jpeg",
          dialogTitle: title,
        });
      }
    } catch (e) {
      // L'utilisateur a annule le partage, pas une erreur
      console.log("Share cancelled or failed:", e);
    } finally {
      setSharing(false);
    }
  }, [title]);

  return { viewShotRef, share, sharing };
}

/** Fallback web : Web Share API ou download */
async function shareWeb(uri: string, title: string) {
  // Web Share API (mobile browsers)
  if (navigator.share && navigator.canShare) {
    try {
      const response = await fetch(uri);
      const blob = await response.blob();
      const file = new File([blob], "mogogo-destiny.jpg", { type: "image/jpeg" });
      if (navigator.canShare({ files: [file] })) {
        await navigator.share({
          title,
          files: [file],
        });
        return;
      }
    } catch {}
  }

  // Fallback : download
  const link = document.createElement("a");
  link.href = uri;
  link.download = "mogogo-destiny.jpg";
  link.click();
}
