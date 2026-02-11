import { View } from "react-native";
import { Stack } from "expo-router";
import { useTranslation } from "react-i18next";
import { useTheme } from "@/contexts/ThemeContext";
import { useProfile } from "@/hooks/useProfile";
import { PlumeBadge } from "@/components/PlumeBadge";

export default function HomeLayout() {
  const { t } = useTranslation();
  const { colors } = useTheme();
  const { plumes } = useProfile();

  return (
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
            {process.env.EXPO_PUBLIC_HIDE_PLUMES !== "true" && <PlumeBadge plumes={plumes} />}
          </View>
        ),
      }}
    />
  );
}
