import { useState } from "react";
import { View, Text, Pressable, StyleSheet, Alert, ActivityIndicator, Image } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useTranslation } from "react-i18next";
import { useAuth } from "@/hooks/useAuth";
import { useTheme } from "@/contexts/ThemeContext";
import type { ThemeColors } from "@/constants";

export default function LoginScreen() {
  const { signInWithGoogle } = useAuth();
  const { t } = useTranslation();
  const { colors } = useTheme();
  const insets = useSafeAreaInsets();
  const s = getStyles(colors);
  const [signingIn, setSigningIn] = useState(false);

  const handleGoogleLogin = async () => {
    setSigningIn(true);
    try {
      await signInWithGoogle();
    } catch (error: any) {
      Alert.alert(t("login.errorTitle"), error.message ?? t("login.errorDefault"));
    } finally {
      setSigningIn(false);
    }
  };

  return (
    <View style={[s.container, { paddingBottom: insets.bottom }]}>
        <Image
            source={require("../../assets/animations/startup/mogogo-accueil.webp")}
            style={s.mascot}
            resizeMode="contain"
        />
      <Text style={s.title}>Mogogo</Text>
      <Text style={s.subtitle}>{t("login.subtitle")}</Text>

      <Pressable
        style={[s.googleButton, signingIn && s.disabledButton]}
        onPress={handleGoogleLogin}
        disabled={signingIn}
      >
        {signingIn ? (
          <ActivityIndicator color={colors.primary} />
        ) : (
          <Text style={s.buttonText}>{t("login.continueGoogle")}</Text>
        )}
      </Pressable>

    </View>
  );
}

const getStyles = (colors: ThemeColors) =>
  StyleSheet.create({
    container: {
      flex: 1,
      justifyContent: "center",
      alignItems: "center",
      padding: 24,
      backgroundColor: colors.background,
    },
    mascot: {
      width: 120,
      height: 120,
      marginBottom: 16,
    },
    title: {
      fontSize: 32,
      fontWeight: "bold",
      color: colors.text,
      marginBottom: 4,
    },
    subtitle: {
      fontSize: 16,
      color: colors.textSecondary,
      marginBottom: 48,
    },
    googleButton: {
      width: "100%",
      padding: 16,
      borderRadius: 12,
      borderWidth: 1,
      borderColor: colors.border,
      alignItems: "center",
      marginBottom: 12,
    },
    disabledButton: {
      opacity: 0.6,
    },
    buttonText: {
      fontSize: 16,
      fontWeight: "600",
      color: colors.text,
    },
  });
