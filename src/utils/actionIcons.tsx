import { MaterialCommunityIcons, MaterialIcons, FontAwesome5, Ionicons } from "@expo/vector-icons";
import type { ActionType } from "@/types";

const ICON_SIZE = 18;

/** Retourne le composant icone correspondant au type d'action */
export function ActionIcon({ type, color }: { type: ActionType; color: string }) {
  switch (type) {
    case "maps":
      return <MaterialIcons name="place" size={ICON_SIZE} color={color} />;
    case "steam":
      return <FontAwesome5 name="steam" size={ICON_SIZE} color={color} />;
    case "youtube":
      return <MaterialCommunityIcons name="youtube" size={ICON_SIZE} color={color} />;
    case "spotify":
      return <FontAwesome5 name="spotify" size={ICON_SIZE} color={color} />;
    case "play_store":
      return <MaterialCommunityIcons name="google-play" size={ICON_SIZE} color={color} />;
    case "streaming":
      return <MaterialIcons name="live-tv" size={ICON_SIZE} color={color} />;
    case "web":
    default:
      return <Ionicons name="globe-outline" size={ICON_SIZE} color={color} />;
  }
}
