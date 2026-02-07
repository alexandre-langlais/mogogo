import { Pressable, Text } from "react-native";
import { Stack, useRouter } from "expo-router";
import { useTranslation } from "react-i18next";
import { FunnelProvider } from "@/contexts/FunnelContext";
import { useTheme } from "@/contexts/ThemeContext";

export default function MainLayout() {
  const { t } = useTranslation();
  const router = useRouter();
  const { colors } = useTheme();

  return (
    <FunnelProvider>
      <Stack
        screenOptions={{
          headerShown: true,
          headerTitle: t("common.appName"),
          headerBackTitle: t("common.back"),
          headerStyle: { backgroundColor: colors.background },
          headerTintColor: colors.text,
          headerTitleStyle: { color: colors.text },
          headerRight: () => (
            <Pressable onPress={() => router.push("/(main)/settings")} hitSlop={8}>
              <Text style={{ fontSize: 22, color: colors.textSecondary }}>⚙️</Text>
            </Pressable>
          ),
        }}
      />
    </FunnelProvider>
  );
}
