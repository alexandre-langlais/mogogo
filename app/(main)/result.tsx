import { View, Text, Pressable, StyleSheet } from "react-native";
import { useRouter } from "expo-router";
import { useFunnel } from "@/contexts/FunnelContext";
import { MogogoMascot } from "@/components/MogogoMascot";
import { openGoogleMapsSearch } from "@/services/places";
import { COLORS } from "@/constants";

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

  const handleOpenMaps = () => {
    openGoogleMapsSearch(
      recommendation.google_maps_query,
      state.context?.location ?? undefined,
    );
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

      <Pressable style={styles.mapsButton} onPress={handleOpenMaps}>
        <Text style={styles.mapsButtonText}>Voir sur Maps</Text>
      </Pressable>

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
  mapsButton: {
    backgroundColor: COLORS.primary,
    padding: 16,
    borderRadius: 12,
    width: "100%",
    alignItems: "center",
    marginBottom: 12,
  },
  mapsButtonText: {
    color: COLORS.white,
    fontSize: 18,
    fontWeight: "600",
  },
  secondaryButton: {
    padding: 14,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: COLORS.border,
    width: "100%",
    alignItems: "center",
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
