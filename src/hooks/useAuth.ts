import { useState, useEffect } from "react";
import * as WebBrowser from "expo-web-browser";
import { makeRedirectUri } from "expo-auth-session";
import * as QueryParams from "expo-auth-session/build/QueryParams";
import { supabase } from "@/services/supabase";
import type { Session, User } from "@supabase/supabase-js";
import { logoutPurchases } from "@/services/purchases";

WebBrowser.maybeCompleteAuthSession();

const redirectTo = makeRedirectUri({
  scheme: "mogogo",
});

console.log("[Auth] redirectTo =", redirectTo);

export function useAuth() {
  const [user, setUser] = useState<User | null>(null);
  const [session, setSession] = useState<Session | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session } }) => {
      setSession(session);
      setUser(session?.user ?? null);
      setLoading(false);
    });

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((_event, session) => {
      setSession(session);
      setUser(session?.user ?? null);
      setLoading(false);
    });

    return () => {
      subscription.unsubscribe();
    };
  }, []);

  const signInWithGoogle = async () => {
    console.log("[Auth] redirectTo envoyé à Supabase:", redirectTo);

    const { data, error } = await supabase.auth.signInWithOAuth({
      provider: "google",
      options: {
        redirectTo,
        skipBrowserRedirect: true,
      },
    });

    if (error) throw error;
    if (!data.url) throw new Error("No OAuth URL returned");

    console.log("[Auth] OAuth URL de Supabase:", data.url);

    const result = await WebBrowser.openAuthSessionAsync(data.url, redirectTo);

    console.log("[Auth] Résultat WebBrowser:", result.type, "url" in result ? result.url : "pas d'url");

    if (result.type !== "success") {
      throw new Error("Connexion annulée");
    }

    const { params, errorCode } = QueryParams.getQueryParams(result.url);

    if (errorCode) {
      throw new Error(params.error_description || "Erreur OAuth");
    }

    const { access_token, refresh_token } = params;

    if (!access_token || !refresh_token) {
      throw new Error("Tokens manquants dans la réponse OAuth");
    }

    const { error: sessionError } = await supabase.auth.setSession({
      access_token,
      refresh_token,
    });

    if (sessionError) throw sessionError;
  };

  const signOut = async () => {
    await logoutPurchases().catch(() => {});
    const { error } = await supabase.auth.signOut();
    if (error) throw error;
  };

  return { user, session, loading, signInWithGoogle, signOut };
}
