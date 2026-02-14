import { useState, useEffect, useRef } from "react";
import { Pressable, Text, StyleSheet, Animated } from "react-native";
import { usePlumes } from "@/contexts/PlumesContext";
import { PlumesModal } from "./PlumesModal";
import { useTheme } from "@/contexts/ThemeContext";

export function PlumeCounter() {
  const { plumes, isPremium } = usePlumes();
  const { colors } = useTheme();
  const [showModal, setShowModal] = useState(false);

  // Animation bounce quand la valeur change
  const scaleAnim = useRef(new Animated.Value(1)).current;
  const prevPlumes = useRef(plumes);

  useEffect(() => {
    if (prevPlumes.current !== null && plumes !== null && plumes !== prevPlumes.current) {
      Animated.sequence([
        Animated.timing(scaleAnim, {
          toValue: 1.3,
          duration: 150,
          useNativeDriver: true,
        }),
        Animated.timing(scaleAnim, {
          toValue: 1,
          duration: 150,
          useNativeDriver: true,
        }),
      ]).start();
    }
    prevPlumes.current = plumes;
  }, [plumes]);

  // Web ou pas de device_id → pas d'affichage
  if (plumes === null && !isPremium) return null;

  const label = isPremium ? "\uD83E\uDEB6 \u221E" : `\uD83E\uDEB6 x ${plumes ?? 0}`;

  return (
    <>
      <Pressable onPress={() => setShowModal(true)} style={styles.container}>
        <Animated.Text style={[styles.text, { color: colors.text, transform: [{ scale: scaleAnim }] }]}>
          {label}
        </Animated.Text>
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
