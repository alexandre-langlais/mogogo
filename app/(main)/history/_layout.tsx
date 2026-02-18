import { Stack } from "expo-router";
import { useTranslation } from "react-i18next";
import { useTheme } from "@/contexts/ThemeContext";

export default function HistoryLayout() {
  const { t } = useTranslation();
  const { colors } = useTheme();

  return (
    <Stack
      screenOptions={{
        headerShown: true,
        headerTitle: t("history.title"),
        headerBackTitle: t("common.back"),
        headerStyle: { backgroundColor: colors.surface },
        headerTintColor: colors.text,
        headerTitleStyle: { color: colors.text },
        animation: "fade",
        contentStyle: { backgroundColor: "transparent" },
      }}
    />
  );
}
