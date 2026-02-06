import { useState } from "react";
import { View, Text, Pressable, StyleSheet, Alert, ActivityIndicator } from "react-native";
import { useAuth } from "@/hooks/useAuth";
import { COLORS } from "@/constants";

export default function LoginScreen() {
  const { signInWithGoogle } = useAuth();
  const [signingIn, setSigningIn] = useState(false);

  const handleGoogleLogin = async () => {
    setSigningIn(true);
    try {
      await signInWithGoogle();
    } catch (error: any) {
      Alert.alert("Erreur", error.message ?? "Connexion échouée");
    } finally {
      setSigningIn(false);
    }
  };

  const handleAppleLogin = () => {
    Alert.alert("Bientôt", "Apple Sign-In arrive prochainement !");
  };

  return (
    <View style={styles.container}>
      <Text style={styles.emoji}>🦉</Text>
      <Text style={styles.title}>Mogogo</Text>
      <Text style={styles.subtitle}>Ton hibou magicien</Text>

      <Pressable
        style={[styles.googleButton, signingIn && styles.disabledButton]}
        onPress={handleGoogleLogin}
        disabled={signingIn}
      >
        {signingIn ? (
          <ActivityIndicator color={COLORS.primary} />
        ) : (
          <Text style={styles.buttonText}>Continuer avec Google</Text>
        )}
      </Pressable>

      <Pressable style={styles.appleButton} onPress={handleAppleLogin}>
        <Text style={[styles.buttonText, { color: COLORS.white }]}>
          Continuer avec Apple
        </Text>
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
  emoji: {
    fontSize: 64,
    marginBottom: 16,
  },
  title: {
    fontSize: 32,
    fontWeight: "bold",
    color: COLORS.text,
    marginBottom: 4,
  },
  subtitle: {
    fontSize: 16,
    color: COLORS.textSecondary,
    marginBottom: 48,
  },
  googleButton: {
    width: "100%",
    padding: 16,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: COLORS.border,
    alignItems: "center",
    marginBottom: 12,
  },
  disabledButton: {
    opacity: 0.6,
  },
  appleButton: {
    width: "100%",
    padding: 16,
    borderRadius: 12,
    backgroundColor: COLORS.black,
    alignItems: "center",
  },
  buttonText: {
    fontSize: 16,
    fontWeight: "600",
    color: COLORS.text,
  },
});
