import { Text } from "react-native";
import { Tabs } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useTranslation } from "react-i18next";
import { FunnelProvider } from "@/contexts/FunnelContext";
import { PlumesProvider } from "@/contexts/PlumesContext";
import { useTheme } from "@/contexts/ThemeContext";
import { useGrimoire } from "@/hooks/useGrimoire";
import { formatPreferencesForLLM } from "@/services/grimoire";

export default function MainLayout() {
  const { t } = useTranslation();
  const { colors } = useTheme();
  const insets = useSafeAreaInsets();
  const { preferences } = useGrimoire();
  const preferencesText = formatPreferencesForLLM(preferences);

  return (
    <PlumesProvider>
    <FunnelProvider preferencesText={preferencesText}>
        <Tabs
          screenOptions={{
            headerShown: false,
            tabBarStyle: {
              backgroundColor: colors.surface,
              borderTopColor: colors.border,
              height: 66 + insets.bottom,
              paddingBottom: 4 + insets.bottom,
              paddingTop: 4,
            },
            tabBarLabelStyle: {
              fontSize: 11,
            },
            tabBarActiveTintColor: colors.primary,
            tabBarInactiveTintColor: colors.textSecondary,
          }}
        >
          <Tabs.Screen
            name="home"
            options={{
              title: t("tabs.home"),
              tabBarIcon: ({ color }) => (
                <Text style={{ fontSize: 22, color }}>{"\uD83E\uDDED"}</Text>
              ),
            }}
          />
          <Tabs.Screen
            name="grimoire"
            options={{
              title: t("tabs.grimoire"),
              headerShown: true,
              headerTitle: t("grimoire.title"),
              headerStyle: { backgroundColor: colors.surface },
              headerTintColor: colors.text,
              headerTitleStyle: { color: colors.text },
              tabBarIcon: ({ color }) => (
                <Text style={{ fontSize: 22, color }}>{"\uD83D\uDCD6"}</Text>
              ),
            }}
          />
          <Tabs.Screen
            name="history"
            options={{
              title: t("tabs.history"),
              headerShown: false,
              tabBarIcon: ({ color }) => (
                <Text style={{ fontSize: 22, color }}>{"\uD83D\uDCDC"}</Text>
              ),
            }}
          />
          <Tabs.Screen
            name="settings"
            options={{
              title: t("tabs.settings"),
              headerShown: true,
              headerTitle: t("settings.title"),
              headerStyle: { backgroundColor: colors.surface },
              headerTintColor: colors.text,
              headerTitleStyle: { color: colors.text },
              tabBarIcon: ({ color }) => (
                <Text style={{ fontSize: 22, color }}>{"\u2699\uFE0F"}</Text>
              ),
            }}
          />
          <Tabs.Screen
            name="training"
            options={{
              href: null,
              headerShown: false,
            }}
          />
        </Tabs>
    </FunnelProvider>
    </PlumesProvider>
  );
}
