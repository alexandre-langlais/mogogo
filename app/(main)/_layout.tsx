import { View, Pressable, Text } from "react-native";
import { Stack, useRouter } from "expo-router";
import { useTranslation } from "react-i18next";
import { FunnelProvider } from "@/contexts/FunnelContext";
import { useTheme } from "@/contexts/ThemeContext";
import { useGrimoire } from "@/hooks/useGrimoire";
import { formatPreferencesForLLM } from "@/services/grimoire";

export default function MainLayout() {
  const { t } = useTranslation();
  const router = useRouter();
  const { colors } = useTheme();
  const { preferences } = useGrimoire();
  const preferencesText = formatPreferencesForLLM(preferences);

  return (
    <FunnelProvider preferencesText={preferencesText}>
      <Stack
        screenOptions={{
          headerShown: true,
          headerTitle: t("common.appName"),
          headerBackTitle: t("common.back"),
          headerStyle: { backgroundColor: colors.background },
          headerTintColor: colors.text,
          headerTitleStyle: { color: colors.text },
          headerRight: () => (
            <View style={{ flexDirection: "row", alignItems: "center", gap: 12 }}>
              <Pressable onPress={() => router.push("/(main)/grimoire")} hitSlop={8}>
                <Text style={{ fontSize: 22, color: colors.textSecondary }}>📖</Text>
              </Pressable>
              <Pressable onPress={() => router.push("/(main)/settings")} hitSlop={8}>
                <Text style={{ fontSize: 22, color: colors.textSecondary }}>⚙️</Text>
              </Pressable>
            </View>
          ),
        }}
      />
    </FunnelProvider>
  );
}
