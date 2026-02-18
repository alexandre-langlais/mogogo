import { createClient } from "@supabase/supabase-js";
import * as SecureStore from "expo-secure-store";
import { Platform } from "react-native";

const ExpoSecureStoreAdapter = {
  getItem: (key: string) => {
    if (Platform.OS === "web") {
      return localStorage.getItem(key);
    }
    return SecureStore.getItemAsync(key);
  },
  setItem: (key: string, value: string) => {
    if (Platform.OS === "web") {
      localStorage.setItem(key, value);
      return;
    }
    return SecureStore.setItemAsync(key, value);
  },
  removeItem: (key: string) => {
    if (Platform.OS === "web") {
      localStorage.removeItem(key);
      return;
    }
    return SecureStore.deleteItemAsync(key);
  },
};

const supabaseUrl = process.env.EXPO_PUBLIC_SUPABASE_URL ?? "";
const supabaseAnonKey = process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY ?? "";

// ── 401 interceptor : force local sign-out on expired/invalid session ──

let _signingOut = false;

const authSafeFetch: typeof fetch = async (input, init) => {
  const response = await fetch(input, init);

  if (response.status === 401 && !_signingOut) {
    const url = typeof input === "string" ? input : (input as Request).url;
    // Ne pas intercepter les endpoints auth (refresh token, sign-in, etc.)
    if (!url.includes("/auth/v1/")) {
      console.warn("[Supabase] 401 détecté — déconnexion locale forcée");
      _signingOut = true;
      supabase.auth.signOut({ scope: "local" }).finally(() => {
        _signingOut = false;
      });
    }
  }

  return response;
};

export const supabase = createClient(supabaseUrl, supabaseAnonKey, {
  auth: {
    storage: ExpoSecureStoreAdapter,
    autoRefreshToken: true,
    persistSession: true,
    detectSessionInUrl: false,
  },
  global: {
    fetch: authSafeFetch,
  },
});
