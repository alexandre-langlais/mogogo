import { Stack } from "expo-router";
import { useTranslation } from "react-i18next";
import { useTheme } from "@/contexts/ThemeContext";
import { PlumeCounter } from "@/components/PlumeCounter";

export default function HomeLayout() {
  const { t } = useTranslation();
  const { colors } = useTheme();

  return (
    <Stack
      screenOptions={{
        headerShown: true,
        headerTitle: t("common.appName"),
        headerBackTitle: t("common.back"),
        headerStyle: { backgroundColor: colors.surface },
        headerTintColor: colors.text,
        headerTitleStyle: { color: colors.text },
        headerRight: () => <PlumeCounter />,
        animation: "fade",
        contentStyle: { backgroundColor: "transparent" },
      }}
    />
  );
}
