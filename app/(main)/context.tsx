import { View, Text, Pressable, StyleSheet, ScrollView } from "react-native";
import { useRouter } from "expo-router";
import { useState } from "react";
import { useFunnel } from "@/contexts/FunnelContext";
import { useLocation } from "@/hooks/useLocation";
import { COLORS } from "@/constants";
import type { UserContext } from "@/types";

const socialOptions = ["Seul", "Amis", "Couple", "Famille"] as const;
const energyLevels = [1, 2, 3, 4, 5] as const;
const budgetOptions = ["Gratuit", "Économique", "Standard", "Luxe"] as const;
const environmentOptions = ["Intérieur", "Extérieur", "Peu importe"] as const;

export default function ContextScreen() {
  const router = useRouter();
  const { setContext } = useFunnel();
  const { location } = useLocation();
  const [social, setSocial] = useState<string>("");
  const [energy, setEnergy] = useState<number>(3);
  const [budget, setBudget] = useState<string>("");
  const [environment, setEnvironment] = useState<string>("");

  const isValid = social && budget && environment;

  const handleStart = () => {
    const ctx: UserContext = {
      social,
      energy,
      budget,
      environment,
      ...(location && { location }),
    };
    setContext(ctx);
    router.push("/(main)/funnel");
  };

  return (
    <ScrollView
      contentContainerStyle={styles.container}
      style={{ backgroundColor: COLORS.background }}
    >
      <Text style={styles.sectionTitle}>Avec qui ?</Text>
      <View style={styles.optionsRow}>
        {socialOptions.map((opt) => (
          <Pressable
            key={opt}
            style={[styles.chip, social === opt && styles.chipActive]}
            onPress={() => setSocial(opt)}
          >
            <Text
              style={[styles.chipText, social === opt && styles.chipTextActive]}
            >
              {opt}
            </Text>
          </Pressable>
        ))}
      </View>

      <Text style={styles.sectionTitle}>Niveau d'énergie</Text>
      <View style={styles.optionsRow}>
        {energyLevels.map((level) => (
          <Pressable
            key={level}
            style={[styles.chip, energy === level && styles.chipActive]}
            onPress={() => setEnergy(level)}
          >
            <Text
              style={[
                styles.chipText,
                energy === level && styles.chipTextActive,
              ]}
            >
              {level}
            </Text>
          </Pressable>
        ))}
      </View>

      <Text style={styles.sectionTitle}>Budget</Text>
      <View style={styles.optionsRow}>
        {budgetOptions.map((opt) => (
          <Pressable
            key={opt}
            style={[styles.chip, budget === opt && styles.chipActive]}
            onPress={() => setBudget(opt)}
          >
            <Text
              style={[styles.chipText, budget === opt && styles.chipTextActive]}
            >
              {opt}
            </Text>
          </Pressable>
        ))}
      </View>

      <Text style={styles.sectionTitle}>Environnement</Text>
      <View style={styles.optionsRow}>
        {environmentOptions.map((opt) => (
          <Pressable
            key={opt}
            style={[styles.chip, environment === opt && styles.chipActive]}
            onPress={() => setEnvironment(opt)}
          >
            <Text
              style={[
                styles.chipText,
                environment === opt && styles.chipTextActive,
              ]}
            >
              {opt}
            </Text>
          </Pressable>
        ))}
      </View>

      {location && (
        <Text style={styles.locationInfo}>
          Localisation activée
        </Text>
      )}

      <Pressable
        style={[styles.startButton, !isValid && styles.startButtonDisabled]}
        onPress={handleStart}
        disabled={!isValid}
      >
        <Text style={styles.startButtonText}>C'est parti !</Text>
      </Pressable>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: {
    padding: 24,
    paddingBottom: 48,
  },
  sectionTitle: {
    fontSize: 18,
    fontWeight: "600",
    marginTop: 24,
    marginBottom: 12,
    color: COLORS.text,
  },
  optionsRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 8,
  },
  chip: {
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderRadius: 20,
    borderWidth: 1,
    borderColor: COLORS.border,
    backgroundColor: "#f9f9f9",
  },
  chipActive: {
    backgroundColor: COLORS.primary,
    borderColor: COLORS.primary,
  },
  chipText: {
    fontSize: 14,
    color: COLORS.text,
  },
  chipTextActive: {
    color: COLORS.white,
  },
  locationInfo: {
    marginTop: 16,
    fontSize: 13,
    color: COLORS.primary,
    fontStyle: "italic",
  },
  startButton: {
    marginTop: 40,
    backgroundColor: COLORS.primary,
    padding: 16,
    borderRadius: 12,
    alignItems: "center",
  },
  startButtonDisabled: {
    opacity: 0.5,
  },
  startButtonText: {
    color: COLORS.white,
    fontSize: 18,
    fontWeight: "600",
  },
});
