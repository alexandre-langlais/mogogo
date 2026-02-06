import { Stack } from "expo-router";
import { FunnelProvider } from "@/contexts/FunnelContext";

export default function MainLayout() {
  return (
    <FunnelProvider>
      <Stack
        screenOptions={{
          headerShown: true,
          headerTitle: "Mogogo",
          headerBackTitle: "Retour",
        }}
      />
    </FunnelProvider>
  );
}
