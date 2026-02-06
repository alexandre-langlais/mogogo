import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "jsr:@supabase/supabase-js@2";

const QUOTA_LIMITS: Record<string, number> = {
  free: 500,
  premium: 5000,
};

const LLM_API_URL = Deno.env.get("LLM_API_URL") ?? "http://localhost:11434/v1";
const LLM_MODEL = Deno.env.get("LLM_MODEL") ?? "gpt-oss:120b-cloud";
const LLM_API_KEY = Deno.env.get("LLM_API_KEY") ?? "";

const SYSTEM_PROMPT = `Tu es Mogogo, un hibou magicien sympathique et bienveillant qui aide les gens à trouver des activités.
Tu dois TOUJOURS répondre en JSON strict avec ce format :
{
  "statut": "en_cours" ou "finalisé",
  "phase": "questionnement" ou "pivot" ou "breakout" ou "resultat",
  "mogogo_message": "Phrase sympathique du hibou magicien",
  "question": "Texte court (max 80 chars)",
  "options": { "A": "Label A", "B": "Label B" },
  "recommandation_finale": { "titre": "...", "explication": "...", "google_maps_query": "..." },
  "metadata": { "pivot_count": 0, "current_branch": "..." }
}

Règles :
- En phase "questionnement", propose des choix binaires A/B pour affiner la recommandation
- Si l'utilisateur choisit "neither" (aucune des deux), fais un pivot latéral ou radical
- Après 3 pivots consécutifs (pivot_count >= 3), passe en phase "breakout" et propose un Top 3
- En phase "resultat" ou "finalisé", fournis recommandation_finale avec une google_maps_query optimisée
- Ne retourne JAMAIS de texte hors du JSON`;

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers": "authorization, content-type, apikey, x-client-info",
};

function jsonResponse(body: unknown, status = 200) {
  return Response.json(body, { status, headers: corsHeaders });
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  if (req.method !== "POST") {
    return jsonResponse({ error: "Method not allowed" }, 405);
  }

  try {
    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    );

    // Auth obligatoire : vérifier le JWT
    const authHeader = req.headers.get("authorization");
    if (!authHeader) {
      return jsonResponse({ error: "Missing authorization header" }, 401);
    }

    const token = authHeader.replace("Bearer ", "");
    const { data: authData, error: authError } = await supabase.auth.getUser(token);

    if (authError || !authData.user) {
      return jsonResponse({ error: "Invalid or expired token" }, 401);
    }

    const user = authData.user;

    // Vérifier quotas
    const { data: profile } = await supabase
      .from("profiles")
      .select("*")
      .eq("id", user.id)
      .single();

    if (profile) {
      // Reset mensuel si nécessaire
      const lastReset = new Date(profile.last_reset_date);
      const now = new Date();
      let requestsCount = profile.requests_count;

      if (
        lastReset.getMonth() !== now.getMonth() ||
        lastReset.getFullYear() !== now.getFullYear()
      ) {
        requestsCount = 0;
        await supabase
          .from("profiles")
          .update({ requests_count: 0, last_reset_date: now.toISOString() })
          .eq("id", user.id);
      }

      // Vérifier la limite
      const limit = QUOTA_LIMITS[profile.plan] ?? QUOTA_LIMITS.free;
      if (requestsCount >= limit) {
        return jsonResponse(
          {
            error: "quota_exceeded",
            message: "Tu as atteint ta limite mensuelle ! Passe au plan Premium ou attends le mois prochain.",
            plan: profile.plan,
            limit,
          },
          429,
        );
      }

      // Incrémenter le compteur
      await supabase
        .from("profiles")
        .update({
          requests_count: requestsCount + 1,
          updated_at: now.toISOString(),
        })
        .eq("id", user.id);
    }

    // Lire le body de la requête
    const body = await req.json();
    const { context, history, choice } = body;

    // Construire les messages pour le LLM
    const messages: Array<{ role: string; content: string }> = [
      { role: "system", content: SYSTEM_PROMPT },
    ];

    if (context) {
      messages.push({
        role: "user",
        content: `Contexte utilisateur : ${JSON.stringify(context)}`,
      });
    }

    if (history && Array.isArray(history)) {
      for (const entry of history) {
        messages.push({ role: "assistant", content: JSON.stringify(entry.response) });
        if (entry.choice) {
          messages.push({ role: "user", content: `Choix : ${entry.choice}` });
        }
      }
    }

    if (choice) {
      messages.push({ role: "user", content: `Choix : ${choice}` });
    }

    // Appeler le LLM via API OpenAI-compatible
    const llmResponse = await fetch(`${LLM_API_URL}/chat/completions`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        ...(LLM_API_KEY ? { Authorization: `Bearer ${LLM_API_KEY}` } : {}),
      },
      body: JSON.stringify({
        model: LLM_MODEL,
        messages,
        temperature: 0.8,
        response_format: { type: "json_object" },
      }),
    });

    if (!llmResponse.ok) {
      const errorText = await llmResponse.text();
      console.error("LLM API error:", errorText);
      return jsonResponse({ error: "LLM request failed" }, 502);
    }

    const llmData = await llmResponse.json();
    const content = llmData.choices?.[0]?.message?.content;

    if (!content) {
      return jsonResponse({ error: "Empty LLM response" }, 502);
    }

    const parsed = JSON.parse(content);

    return jsonResponse(parsed);
  } catch (error) {
    console.error("Edge function error:", error);
    return jsonResponse({ error: "Internal server error" }, 500);
  }
});
