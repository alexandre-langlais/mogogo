import { useEffect, useRef } from "react";
import { View, Pressable, Text, StyleSheet, Animated } from "react-native";
import { useRouter } from "expo-router";
import { useFunnel } from "@/contexts/FunnelContext";
import { MogogoMascot } from "@/components/MogogoMascot";
import { ChoiceButton } from "@/components/ChoiceButton";
import { LoadingMogogo } from "@/components/LoadingMogogo";
import { COLORS } from "@/constants";

export default function FunnelScreen() {
  const router = useRouter();
  const { state, makeChoice, goBack, reset } = useFunnel();
  const { currentResponse, loading, error, history } = state;
  const fadeAnim = useRef(new Animated.Value(1)).current;

  // Premier appel LLM au montage
  useEffect(() => {
    if (!currentResponse && !loading && state.context) {
      makeChoice(undefined);
    }
  }, []);

  // Navigation vers résultat quand finalisé
  useEffect(() => {
    if (currentResponse?.statut === "finalisé") {
      router.replace("/(main)/result");
    }
  }, [currentResponse?.statut]);

  // Animation fade sur changement de question
  useEffect(() => {
    if (currentResponse && !loading) {
      fadeAnim.setValue(0);
      Animated.timing(fadeAnim, {
        toValue: 1,
        duration: 300,
        useNativeDriver: true,
      }).start();
    }
  }, [currentResponse]);

  if (loading) {
    return <LoadingMogogo />;
  }

  if (error) {
    const isQuotaError = error.includes("429") || error.toLowerCase().includes("quota");
    return (
      <View style={styles.container}>
        <MogogoMascot
          message={
            isQuotaError
              ? "Oh non ! Tu as utilisé toutes tes requêtes ce mois-ci. Reviens bientôt ou passe en premium !"
              : "Oups, quelque chose s'est mal passé..."
          }
        />
        <Text style={styles.errorText}>{error}</Text>
        {!isQuotaError && (
          <ChoiceButton
            label="Réessayer"
            onPress={() => makeChoice(state.lastChoice)}
          />
        )}
        <View style={{ height: 12 }} />
        <ChoiceButton
          label="Recommencer"
          variant="secondary"
          onPress={() => {
            reset();
            router.replace("/(main)/context");
          }}
        />
      </View>
    );
  }

  if (!currentResponse) {
    return <LoadingMogogo message="Mogogo prépare ses questions..." />;
  }

  return (
    <View style={styles.container}>
      <Animated.View style={[styles.content, { opacity: fadeAnim }]}>
        <MogogoMascot message={currentResponse.mogogo_message} />

        {currentResponse.question && (
          <Text style={styles.question}>{currentResponse.question}</Text>
        )}

        <View style={styles.buttonsContainer}>
          {currentResponse.options && (
            <>
              <ChoiceButton
                label={currentResponse.options.A}
                onPress={() => makeChoice("A")}
              />
              <ChoiceButton
                label={currentResponse.options.B}
                onPress={() => makeChoice("B")}
              />
            </>
          )}

          <ChoiceButton
            label="Peu importe"
            variant="secondary"
            onPress={() => makeChoice("any")}
          />
          <ChoiceButton
            label="Aucune des deux"
            variant="secondary"
            onPress={() => makeChoice("neither")}
          />
        </View>
      </Animated.View>

      <View style={styles.footer}>
        {history.length > 0 && (
          <Pressable style={styles.backButton} onPress={goBack}>
            <Text style={styles.backText}>← Revenir</Text>
          </Pressable>
        )}
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
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    justifyContent: "center",
    padding: 24,
    backgroundColor: COLORS.background,
  },
  content: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
  },
  question: {
    fontSize: 22,
    fontWeight: "bold",
    textAlign: "center",
    marginBottom: 32,
    color: COLORS.text,
  },
  buttonsContainer: {
    width: "100%",
    gap: 12,
  },
  errorText: {
    fontSize: 14,
    color: COLORS.textSecondary,
    textAlign: "center",
    marginBottom: 24,
  },
  footer: {
    flexDirection: "row",
    justifyContent: "space-between",
    paddingTop: 16,
    paddingBottom: 8,
  },
  backButton: {
    padding: 12,
  },
  backText: {
    fontSize: 16,
    color: COLORS.primary,
    fontWeight: "500",
  },
  restartButton: {
    padding: 12,
  },
  restartText: {
    fontSize: 16,
    color: COLORS.textSecondary,
  },
});
