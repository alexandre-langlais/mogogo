import { useState } from "react";
import { Pressable, Text, StyleSheet } from "react-native";
import { usePlumes } from "@/contexts/PlumesContext";
import { PlumesModal } from "./PlumesModal";
import { useTheme } from "@/contexts/ThemeContext";

export function PlumeCounter() {
  const { plumes, isPremium } = usePlumes();
  const { colors } = useTheme();
  const [showModal, setShowModal] = useState(false);

  // Web ou pas de device_id → pas d'affichage
  if (plumes === null && !isPremium) return null;

  const label = isPremium ? "\uD83E\uDEB6 \u221E" : `\uD83E\uDEB6 x ${plumes ?? 0}`;

  return (
    <>
      <Pressable onPress={() => setShowModal(true)} style={styles.container}>
        <Text style={[styles.text, { color: colors.text }]}>{label}</Text>
      </Pressable>
      <PlumesModal visible={showModal} onClose={() => setShowModal(false)} />
    </>
  );
}

const styles = StyleSheet.create({
  container: {
    paddingHorizontal: 12,
    paddingVertical: 6,
  },
  text: {
    fontSize: 15,
    fontWeight: "600",
  },
});
