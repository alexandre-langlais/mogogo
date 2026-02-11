import { View, Text } from "react-native";
import { Tabs } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useTranslation } from "react-i18next";
import { FunnelProvider } from "@/contexts/FunnelContext";
import { useTheme } from "@/contexts/ThemeContext";
import { useGrimoire } from "@/hooks/useGrimoire";
import { useProfile } from "@/hooks/useProfile";
import { formatPreferencesForLLM } from "@/services/grimoire";
import { MogogoAdBanner } from "@/components/MogogoAdBanner";
import { AD_UNIT_IDS } from "@/services/admob";

export default function MainLayout() {
  const { t } = useTranslation();
  const { colors } = useTheme();
  const insets = useSafeAreaInsets();
  const { preferences } = useGrimoire();
  const { profile, reload: reloadProfile } = useProfile();
  const preferencesText = formatPreferencesForLLM(preferences);
  const showAds = profile?.plan !== "premium" && !!AD_UNIT_IDS.BANNER;

  return (
    <FunnelProvider preferencesText={preferencesText} onPlumeConsumed={reloadProfile}>
      <View style={{ flex: 1, backgroundColor: colors.background }}>
        <Tabs
          screenOptions={{
            headerShown: false,
            tabBarStyle: {
              backgroundColor: colors.background,
              borderTopColor: colors.border,
              height: 66 + (showAds ? 0 : insets.bottom),
              paddingBottom: showAds ? 4 : 4 + insets.bottom,
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
              headerStyle: { backgroundColor: colors.background },
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
              headerStyle: { backgroundColor: colors.background },
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
        <MogogoAdBanner />
      </View>
    </FunnelProvider>
  );
}
