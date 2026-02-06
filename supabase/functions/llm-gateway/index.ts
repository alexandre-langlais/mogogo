import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "jsr:@supabase/supabase-js@2";

const QUOTA_LIMITS: Record<string, number> = {
  free: 500,
  premium: 5000,
};

const LLM_API_URL = Deno.env.get("LLM_API_URL") ?? "http://localhost:11434/v1";
const LLM_MODEL = Deno.env.get("LLM_MODEL") ?? "gpt-oss:120b-cloud";
const LLM_API_KEY = Deno.env.get("LLM_API_KEY") ?? "";

const SYSTEM_PROMPT = `Tu es Mogogo, un hibou magicien bienveillant qui aide à trouver LA bonne activité. Réponds TOUJOURS en JSON strict :
{
  "statut": "en_cours"|"finalisé",
  "phase": "questionnement"|"pivot"|"breakout"|"resultat",
  "mogogo_message": "1 phrase courte du hibou (max 100 chars)",
  "question": "Question courte (max 80 chars)",
  "options": {"A":"Label court","B":"Label court"},
  "recommandation_finale": {
    "titre": "Nom de l'activité",
    "explication": "2-3 phrases max",
    "actions": [{"type":"maps|web|steam|app_store|play_store|youtube|streaming|spotify","label":"Texte du bouton","query":"requête de recherche"}]
  },
  "metadata": {"pivot_count":0,"current_branch":"..."}
}

Règles :
- PREMIÈRE question OBLIGATOIRE : 2 catégories LARGES couvrant TOUS les domaines possibles. Chaque option DOIT lister 3-4 exemples concrets entre parenthèses.
  Exemples de bonnes Q1 :
  * Seul/Intérieur : "Écran (film, série, jeu vidéo, musique)" vs "Hors écran (lecture, yoga, cuisine, dessin)"
  * Amis/Extérieur : "Sortie (resto, bar, concert, escape)" vs "Sport (rando, vélo, escalade, foot)"
  * Couple/Extérieur : "Gastronomie (resto, bar à vin, pique-nique)" vs "Culture & nature (musée, balade, concert)"
  Adapte au contexte (énergie, social, budget, environnement).
- Converge vite : 3-5 questions max avant de finaliser. Chaque question affine vers une activité CONCRÈTE et SPÉCIFIQUE (un titre, un lieu, un nom).
- IMPORTANT : chaque Q doit sous-diviser TOUTES les sous-catégories de l'option choisie. Ex: si Q1="Écran (film, série, jeu, musique)" est choisi, Q2 DOIT séparer "Visuel (film, série, jeu)" vs "Audio (musique, podcast)" — ne jamais oublier une sous-catégorie.
- Options A/B courtes (max 50 chars), contrastées, concrètes — inclure des exemples entre parenthèses
- "neither" → pivot latéral (incrémente pivot_count)
- pivot_count >= 3 → breakout (Top 3)
- En "finalisé" : titre = nom précis (titre de jeu, nom de resto, film exact...), explication = 2-3 phrases, et 1-3 actions pertinentes :
  * Lieu physique → "maps" (restaurant, parc, salle...)
  * Jeu PC → "steam" + "youtube" (trailer)
  * Jeu mobile → "app_store" + "play_store"
  * Film/série → "streaming" + "youtube" (bande-annonce)
  * Musique → "spotify"
  * Cours/tuto → "youtube" + "web"
  * Autre → "web"
- Sois bref partout. Pas de texte hors JSON.`;

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
        temperature: 0.7,
        max_tokens: 800,
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
