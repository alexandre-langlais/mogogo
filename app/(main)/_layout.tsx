import { Text } from "react-native";
import { Tabs } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useTranslation } from "react-i18next";
import { FunnelProvider } from "@/contexts/FunnelContext";
import { PlumesProvider } from "@/contexts/PlumesContext";
import { useTheme } from "@/contexts/ThemeContext";
import { useGrimoire } from "@/hooks/useGrimoire";
import { useSubscriptions } from "@/hooks/useSubscriptions";
import { formatPreferencesForLLM } from "@/services/grimoire";
import { formatSubscriptionsForLLM } from "@/services/subscriptions";
import { HeaderRight } from "@/components/HeaderRight";

export default function MainLayout() {
  const { t } = useTranslation();
  const { colors } = useTheme();
  const insets = useSafeAreaInsets();
  const { preferences, reload: reloadPreferences } = useGrimoire();
  const { services, reload: reloadSubscriptions } = useSubscriptions();
  const preferencesText = formatPreferencesForLLM(preferences);
  const subscriptionsText = formatSubscriptionsForLLM(services);

  return (
    <PlumesProvider>
    <FunnelProvider preferencesText={preferencesText} subscriptionsText={subscriptionsText} subscribedServices={services} reloadSubscriptions={reloadSubscriptions} reloadPreferences={reloadPreferences}>
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
            name="dashboard"
            options={{
              title: t("tabs.dashboard"),
              headerShown: true,
              headerTitle: t("common.appName"),
              headerStyle: { backgroundColor: colors.surface },
              headerTintColor: colors.text,
              headerTitleStyle: { color: colors.text },
              headerRight: () => <HeaderRight />,
              tabBarIcon: ({ color }) => (
                <Text style={{ fontSize: 22, color }}>{"\uD83C\uDFE0"}</Text>
              ),
            }}
          />
          <Tabs.Screen
            name="home"
            options={{
              title: t("tabs.home"),
              tabBarIcon: ({ color }) => (
                <Text style={{ fontSize: 22, color }}>{"\u2728"}</Text>
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
              headerRight: () => <HeaderRight />,
              tabBarIcon: ({ color }) => (
                <Text style={{ fontSize: 22, color }}>{"\uD83D\uDCD6"}</Text>
              ),
            }}
          />
          <Tabs.Screen
            name="history"
            options={{
              href: null,
              headerShown: false,
            }}
          />
          <Tabs.Screen
            name="settings"
            options={{
              href: null,
              headerShown: true,
              headerTitle: t("settings.title"),
              headerStyle: { backgroundColor: colors.surface },
              headerTintColor: colors.text,
              headerTitleStyle: { color: colors.text },
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
