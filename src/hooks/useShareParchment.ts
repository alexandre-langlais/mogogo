import { useCallback, useRef, useState } from "react";
import { Platform } from "react-native";
import { useTranslation } from "react-i18next";
import type ViewShot from "react-native-view-shot";
import RNShare from "react-native-share";

const PLAY_STORE_URL = "https://play.google.com/apps/4701695797260563642";

export function useShareParchment(title: string, customMessage?: string) {
  const { t } = useTranslation();
  const viewShotRef = useRef<ViewShot>(null);
  const [sharing, setSharing] = useState(false);

  const share = useCallback(async () => {
    if (!viewShotRef.current?.capture) return;

    setSharing(true);
    try {
      const uri = await viewShotRef.current.capture();
      const message = customMessage ?? `${t("result.parchmentLabel")} ! ${PLAY_STORE_URL}`;

      if (Platform.OS === "web") {
        await shareWeb(uri, title, message);
      } else {
        await RNShare.open({
          title,
          message,
          url: uri,
          type: "image/jpeg",
          failOnCancel: false,
        });
      }
    } catch (e) {
      // L'utilisateur a annule le partage, pas une erreur
      console.log("Share cancelled or failed:", e);
    } finally {
      setSharing(false);
    }
  }, [title, customMessage, t]);

  return { viewShotRef, share, sharing };
}

/** Fallback web : Web Share API ou download */
async function shareWeb(uri: string, title: string, message: string) {
  if (navigator.share && navigator.canShare) {
    try {
      const response = await fetch(uri);
      const blob = await response.blob();
      const file = new File([blob], "mogogo-destiny.jpg", { type: "image/jpeg" });
      if (navigator.canShare({ files: [file] })) {
        await navigator.share({
          title,
          text: message,
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
