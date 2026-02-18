import "@/i18n";
import { useEffect, useMemo, useState } from "react";
import { ActivityIndicator, ImageBackground, StyleSheet, View } from "react-native";
import { Stack, useRouter, useSegments } from "expo-router";
import { ThemeProvider as NavThemeProvider, DarkTheme, DefaultTheme } from "@react-navigation/native";
import { SafeAreaProvider } from "react-native-safe-area-context";
import { StatusBar } from "expo-status-bar";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { useAuth } from "@/hooks/useAuth";
import { ThemeProvider, useTheme } from "@/contexts/ThemeContext";
import { initAdMob } from "@/services/admob";
import { initPurchases } from "@/services/purchases";
import { ONBOARDING_DONE_KEY } from "./permissions";

const BG_DARK = require("../assets/bg-dark.webp");

function AuthGuard({ children }: { children: React.ReactNode }) {
  const { session, loading } = useAuth();
  const segments = useSegments();
  const router = useRouter();
  const { colors } = useTheme();
  const [onboardingChecked, setOnboardingChecked] = useState(false);
  const [onboardingDone, setOnboardingDone] = useState(false);

  // Charger le flag onboarding au montage
  useEffect(() => {
    AsyncStorage.getItem(ONBOARDING_DONE_KEY).then((val) => {
      setOnboardingDone(val === "true");
      setOnboardingChecked(true);
    });
  }, []);

  useEffect(() => {
    if (loading || !onboardingChecked) return;

    const firstSegment = segments[0];
    const inAuthGroup = firstSegment === "(auth)";
    const inMainGroup = firstSegment === "(main)";
    const isPermissions = firstSegment === "permissions";

    if (!session && inMainGroup) {
      router.replace("/");
    } else if (session && !onboardingDone && !isPermissions) {
      router.replace("/permissions");
    } else if (session && onboardingDone && !inMainGroup) {
      router.replace("/(main)/home");
    }
  }, [session, loading, segments, onboardingChecked, onboardingDone]);

  if (loading || !onboardingChecked) {
    return (
      <View style={{ flex: 1, justifyContent: "center", alignItems: "center", backgroundColor: colors.background }}>
        <ActivityIndicator size="large" color={colors.primary} />
      </View>
    );
  }

  return <>{children}</>;
}

function RootContent() {
  const { isDark, colors } = useTheme();

  const navTheme = useMemo(
    () => ({
      ...(isDark ? DarkTheme : DefaultTheme),
      colors: {
        ...(isDark ? DarkTheme : DefaultTheme).colors,
        background: "transparent",
        card: isDark ? "rgba(30, 30, 40, 0.8)" : colors.surface,
      },
    }),
    [isDark, colors],
  );

  useEffect(() => {
    initAdMob().catch((err) => console.warn("[AdMob] Init failed:", err));
    initPurchases().catch((err) => console.warn("[Purchases] Init failed:", err));
  }, []);

  const content = (
    <NavThemeProvider value={navTheme}>
      <StatusBar style={isDark ? "light" : "dark"} />
      <AuthGuard>
        <Stack screenOptions={{ headerShown: false, animation: "fade" }} />
      </AuthGuard>
    </NavThemeProvider>
  );

  if (isDark) {
    return (
      <ImageBackground source={BG_DARK} style={rootStyles.bg} resizeMode="cover">
        {content}
      </ImageBackground>
    );
  }

  return <View style={[rootStyles.bg, { backgroundColor: "#FFFFFF" }]}>{content}</View>;
}

const rootStyles = StyleSheet.create({
  bg: { flex: 1 },
});

export default function RootLayout() {
  return (
    <SafeAreaProvider>
      <ThemeProvider>
        <RootContent />
      </ThemeProvider>
    </SafeAreaProvider>
  );
}
