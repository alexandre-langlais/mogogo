import { View, Text, Pressable, StyleSheet } from "react-native";
import { useRouter } from "expo-router";
import { useFunnel } from "@/contexts/FunnelContext";
import { MogogoMascot } from "@/components/MogogoMascot";
import { openAction, openGoogleMapsSearch } from "@/services/places";
import { COLORS } from "@/constants";
import type { Action } from "@/types";

const ACTION_LABELS: Record<string, string> = {
  maps: "Voir sur Maps",
  steam: "Chercher sur Steam",
  web: "Rechercher",
  youtube: "Voir sur YouTube",
  app_store: "App Store",
  play_store: "Play Store",
  streaming: "Regarder en streaming",
  spotify: "Écouter sur Spotify",
};

export default function ResultScreen() {
  const router = useRouter();
  const { state, reset } = useFunnel();
  const { currentResponse } = state;

  const recommendation = currentResponse?.recommandation_finale;

  if (!recommendation) {
    return (
      <View style={styles.container}>
        <MogogoMascot message="Hmm, je n'ai pas trouvé de recommandation..." />
        <Pressable
          style={styles.restartButton}
          onPress={() => {
            reset();
            router.replace("/(main)/context");
          }}
        >
          <Text style={styles.restartText}>Recommencer</Text>
        </Pressable>
      </View>
    );
  }

  const actions = recommendation.actions ?? [];

  // Fallback : si pas d'actions mais google_maps_query existe
  const effectiveActions: Action[] = actions.length > 0
    ? actions
    : recommendation.google_maps_query
      ? [{ type: "maps" as const, label: "Voir sur Maps", query: recommendation.google_maps_query }]
      : [];

  const handleAction = (action: Action) => {
    if (action.type === "maps") {
      openAction(action, state.context?.location ?? undefined);
    } else {
      openAction(action);
    }
  };

  const handleRestart = () => {
    reset();
    router.replace("/(main)/context");
  };

  return (
    <View style={styles.container}>
      <MogogoMascot
        message={currentResponse?.mogogo_message ?? "Mogogo a trouvé l'activité parfaite !"}
      />

      <View style={styles.card}>
        <Text style={styles.title}>{recommendation.titre}</Text>
        <Text style={styles.explanation}>{recommendation.explication}</Text>
      </View>

      {effectiveActions.map((action, index) => (
        <Pressable
          key={index}
          style={index === 0 ? styles.primaryButton : styles.actionButton}
          onPress={() => handleAction(action)}
        >
          <Text style={index === 0 ? styles.primaryButtonText : styles.actionButtonText}>
            {action.label || ACTION_LABELS[action.type] || "Ouvrir"}
          </Text>
        </Pressable>
      ))}

      <Pressable style={styles.secondaryButton} onPress={handleRestart}>
        <Text style={styles.secondaryText}>Recommencer</Text>
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
    padding: 24,
    backgroundColor: COLORS.background,
  },
  card: {
    backgroundColor: COLORS.surface,
    padding: 24,
    borderRadius: 16,
    width: "100%",
    marginBottom: 32,
  },
  title: {
    fontSize: 24,
    fontWeight: "bold",
    marginBottom: 12,
    color: COLORS.text,
  },
  explanation: {
    fontSize: 16,
    color: COLORS.text,
    lineHeight: 24,
  },
  primaryButton: {
    backgroundColor: COLORS.primary,
    padding: 16,
    borderRadius: 12,
    width: "100%",
    alignItems: "center",
    marginBottom: 10,
  },
  primaryButtonText: {
    color: COLORS.white,
    fontSize: 18,
    fontWeight: "600",
  },
  actionButton: {
    backgroundColor: COLORS.surface,
    padding: 14,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: COLORS.primary,
    width: "100%",
    alignItems: "center",
    marginBottom: 10,
  },
  actionButtonText: {
    color: COLORS.primary,
    fontSize: 16,
    fontWeight: "600",
  },
  secondaryButton: {
    padding: 14,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: COLORS.border,
    width: "100%",
    alignItems: "center",
    marginTop: 6,
  },
  secondaryText: {
    fontSize: 16,
    color: COLORS.textSecondary,
  },
  restartButton: {
    marginTop: 24,
    padding: 16,
    borderRadius: 12,
    backgroundColor: COLORS.primary,
    width: "100%",
    alignItems: "center",
  },
  restartText: {
    color: COLORS.white,
    fontSize: 18,
    fontWeight: "600",
  },
});
