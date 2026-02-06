# Spécifications Fonctionnelles & Techniques : Application Mogogo

## 1. Vision du Produit
* **Nom de l'application** : Mogogo
* **Mascotte** : **Mogogo**, un hibou magicien avec un chapeau de magicien.
* **Ton de la mascotte** : Sympathique, amical et bienveillant. Elle agit comme un guide magique qui parle avec enthousiasme.
* **Concept** : Un assistant mobile de recommandation d'activités contextuelles. L'utilisateur trouve son activité via un entonnoir de décisions binaires (boutons A/B) animé par une IA.

## 2. Variables de Contexte (Inputs)
Le LLM utilise ces données pour filtrer les propositions initiales :
* **Social** : Seul, Amis, Couple, Famille (avec/sans enfants).
* **Énergie** : Niveau 1 (épuisé) à 5 (survolté).
* **Budget** : Gratuit, Économique, Standard, Luxe.
* **Environnement** : Intérieur, Extérieur, Peu importe.
* **Localisation** : Coordonnées GPS précises (pour le grounding final).

## 3. Logique du Moteur de Décision (LLM)
L'application ne possède pas de base de données d'activités. Elle délègue la logique au LLM.

### Gestion des interactions :
| Action Utilisateur | Comportement du LLM |
| :--- | :--- |
| **Option A ou B** | Avance dans la branche logique pour affiner le choix. |
| **Peu importe** | Neutralise le critère actuel et passe à une autre dimension de choix. |
| **Aucune des deux** | **Pivot Dynamique** : Le LLM analyse l'historique et décide d'un pivot latéral (autre style dans le même thème) ou radical (changement de thème). |

### Règle du "Breakout" (Sortie de secours) :
* **Déclencheur** : Après **3 pivots consécutifs** (3 clics sur "Aucune des deux").
* **Action** : Le LLM abandonne le mode binaire et renvoie un **Top 3** d'activités variées basées sur le contexte global pour forcer la décision.

## 4. Grounding & Stratégie de Repli (Plan B)
L'application transforme l'intention du LLM en lieux réels via l'API Google Places.
1. **Requête** : Utilise le champ `Maps_query` fourni par le LLM (ex: "Boulangerie artisanale terrasse").
2. **Filtres** : `openNow: true` et Note > 4.0.
3. **Stratégie Plan B (Client-side)** : Si 0 résultat trouvé :
    * Élargir automatiquement le rayon de recherche (ex: de 5km à 15km).
    * Simplifier la requête (supprimer les adjectifs pour ne garder que le mot-clé principal).
    * Cette étape est gérée par le code client sans solliciter le LLM.

## 5. Architecture Technique & Sécurité
* **Frontend** : React Native (Expo) + TypeScript.
* **Backend** : Supabase (Auth, PostgreSQL, Edge Functions).
* **Authentification** : Obligatoire via **Google** ou **Apple**.
* **Sécurité** : Les clés API (Anthropic/Google) sont stockées en variables d'environnement sur Supabase. L'App mobile ne parle qu'à l'Edge Function.

### Système de Quotas (Anti-Dérive)
Le contrôle est effectué côté serveur avant chaque appel au LLM :
* **Utilisateur Gratuit** : Limite à **500 requêtes** / mois.
* **Utilisateur Premium** : Limite à **5000 requêtes** / mois.
* **Gestion** : Si quota atteint, Mogogo affiche un message amical proposant de passer au plan supérieur ou d'attendre le mois suivant.

## 6. Modèle de Données (SQL Supabase)
```sql
CREATE TABLE public.profiles (
  id uuid REFERENCES auth.users ON DELETE CASCADE PRIMARY KEY,
  full_name text,
  plan text DEFAULT 'free' CHECK (plan IN ('free', 'premium')),
  requests_count int DEFAULT 0,
  last_reset_date timestamp with time zone DEFAULT timezone('utc'::text, now()),
  updated_at timestamp with time zone DEFAULT timezone('utc'::text, now())
);

ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users can view own profile" ON public.profiles FOR SELECT USING (auth.uid() = id);
```

## 7. Contrat d'Interface (JSON Strict)

Le LLM doit répondre exclusivement dans ce format :
JSON
```json
{
"statut": "en_cours | finalisé",
"phase": "questionnement | pivot | breakout | resultat",
"mogogo_message": "Phrase sympathique du hibou magicien",
"question": "Texte court (max 80 chars)",
"options": {
"A": "Label A",
"B": "Label B"
},
"recommandation_finale": {
"titre": "Nom de l'activité",
"explication": "Pourquoi Mogogo a choisi cela",
"google_maps_query": "Requête optimisée pour Places API"
},
"metadata": {
"pivot_count": 0,
"current_branch": "Urbain/Culture"
}
}
```

## 8. UX / UI Mobile

   Ergonomie : Utilisation exclusive au pouce (boutons en bas d'écran).

   Mascotte : Présence visuelle de Mogogo pour commenter les étapes.

   Navigation : Backtracking (retour arrière) géré par l'application via la pile des états JSON.