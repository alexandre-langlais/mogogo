import { useState, useEffect } from "react";
import { View, StyleSheet } from "react-native";
import { useLocalSearchParams } from "expo-router";
import { useTranslation } from "react-i18next";
import { SegmentedControl } from "@/components/SegmentedControl";
import { AffinitesView } from "@/components/AffinitesView";
import { SouvenirsView } from "@/components/SouvenirsView";
import { FeedbackFooter } from "@/components/FeedbackFooter";
import { useTheme } from "@/contexts/ThemeContext";

export default function GrimoireScreen() {
  const { t } = useTranslation();
  const { colors } = useTheme();
  const [activeTab, setActiveTab] = useState<"affinites" | "souvenirs">("affinites");
  const params = useLocalSearchParams<{ tab?: string }>();

  useEffect(() => {
    if (params.tab === "souvenirs") setActiveTab("souvenirs");
  }, [params.tab]);

  const segments = [
    { key: "affinites", label: t("grimoire.tabAffinites") },
    { key: "souvenirs", label: t("grimoire.tabSouvenirs") },
  ];

  return (
    <View style={s.container}>
      <SegmentedControl
        segments={segments}
        activeKey={activeTab}
        onSelect={(key) => setActiveTab(key as "affinites" | "souvenirs")}
      />
      <View style={s.content}>
        {activeTab === "affinites" ? <AffinitesView /> : <SouvenirsView />}
      </View>
      <FeedbackFooter />
    </View>
  );
}

const s = StyleSheet.create({
  container: {
    flex: 1,
  },
  content: {
    flex: 1,
  },
});
