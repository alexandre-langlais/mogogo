# Specifications Fonctionnelles & Techniques : Application Mogogo

## 1. Vision du Produit

* **Nom de l'application** : Mogogo
* **Mascotte** : **Mogogo**, un hibou magicien avec un chapeau de magicien.
* **Ton de la mascotte** : Sympathique, amical et bienveillant. Elle agit comme un guide magique qui parle avec enthousiasme.
* **Concept** : Un assistant mobile de recommandation d'activites contextuelles. L'utilisateur trouve son activite via un entonnoir de decisions binaires (boutons A/B) anime par une IA.

## 2. Variables de Contexte (Inputs)

Le LLM utilise ces donnees pour filtrer les propositions initiales :

| Variable | Valeurs (cles machine) | Affichage |
| :--- | :--- | :--- |
| **Social** | `solo`, `friends`, `couple`, `family` | Seul, Amis, Couple, Famille |
| **Energie** | `1` a `5` (nombre) | Niveau 1 (epuise) a 5 (survolte) |
| **Budget** | `free`, `budget`, `standard`, `luxury` | Gratuit, Economique, Standard, Luxe |
| **Environnement** | `indoor`, `outdoor`, `any_env` | Interieur, Exterieur, Peu importe |
| **Timing** | `"now"` ou `"YYYY-MM-DD"` (ISO) | Maintenant ou date precise |
| **Localisation** | `{ latitude, longitude }` (GPS) | Detection automatique |
| **Langue** | `"fr"`, `"en"`, `"es"` | Francais, Anglais, Espagnol |
| **Age enfants** | `{ min, max }` (0-16, optionnel) | Range slider, conditionnel a Social = Famille |

### Age des enfants (conditionnel a Famille)
Quand l'utilisateur choisit `family` comme groupe social, un **range slider a deux poignees** (0-16 ans) apparait en animation sous la grille sociale. Il permet de preciser la tranche d'age des enfants. Si un autre groupe social est selectionne, le slider disparait et les valeurs sont reinitialises (defaut : `{ min: 0, max: 16 }`). Le champ `children_ages` n'est inclus dans le contexte envoye au LLM que si `social === "family"`.

Le composant `AgeRangeSlider` est un slider custom utilisant `PanResponder` + `Animated` (pas de dependance externe). Deux poignees rondes (28px) blanches avec bordure primary, track actif colore, label de resume "De X a Y ans" sous le slider.

### Validation
Le bouton "C'est parti" est desactive tant que **social**, **budget** et **environment** ne sont pas renseignes, ou si le solde de plumes est a 0 (avec message explicatif). L'energie a une valeur par defaut (3). Le timing vaut `"now"` par defaut.

### Timing : enrichissement cote serveur
Quand `timing !== "now"`, l'Edge Function enrichit le contexte LLM avec :
- Jour de la semaine, jour, mois, annee
- Saison (printemps/ete/automne/hiver)
- Message traduit selon la langue active

## 3. Le Grimoire : Preferences Thematiques Utilisateur

Le Grimoire est un systeme de memoire a long terme sous forme de **tags thematiques scores**. Il oriente les suggestions du LLM sans overrider le contexte immediat de la session.

### Principe
Chaque utilisateur dispose d'un ensemble de tags (ex: `nature:80`, `jeux:50`) qui refletent ses gouts. Ces scores sont injectes dans le prompt LLM comme contexte supplementaire, et mis a jour automatiquement a chaque activite validee.

### Catalogue de tags (14 tags)

| Slug | Emoji | Description |
| :--- | :--- | :--- |
| `sport` | ⚽ | Sport |
| `culture` | 🎭 | Culture |
| `gastronomie` | 🍽️ | Gastronomie |
| `nature` | 🌿 | Nature |
| `detente` | 🧘 | Detente |
| `fete` | 🎉 | Fete |
| `creatif` | 🎨 | Creatif |
| `jeux` | 🎮 | Jeux |
| `musique` | 🎵 | Musique |
| `cinema` | 🎬 | Cinema |
| `voyage` | ✈️ | Voyage |
| `tech` | 💻 | Tech |
| `social` | 🤝 | Social |
| `insolite` | ✨ | Insolite |

### Scoring
- **Score initial** (ajout manuel) : 10
- **Score initial** (auto-init) : 5
- **Boost** : +10 a chaque validation d'activite correspondante (cap 100)
- **Plage** : 0 a 100

### Initialisation automatique
A la premiere ouverture du Grimoire (aucune preference), les 6 tags par defaut sont crees avec un score de 5 : `sport`, `culture`, `gastronomie`, `nature`, `detente`, `fete`.

### Injection LLM
Les preferences sont formatees en texte lisible et injectees comme message `system` dans le prompt, entre le contexte utilisateur et l'historique de conversation :
```
Preferences thematiques de l'utilisateur (oriente tes suggestions sans overrider le contexte) :
⚽ sport: 80/100, 🌿 nature: 60/100, 🎮 jeux: 50/100
```

### Tags en reponse finalisee
Quand le LLM repond en `statut: "finalise"`, il inclut un champ `tags` dans `recommandation_finale` : liste de 1 a 3 slugs thematiques correspondant a l'activite recommandee. Ces tags sont utilises pour le boost automatique.

## 4. Historique des Sessions

L'historique persiste les recommandations validees par l'utilisateur dans Supabase et les rend consultables depuis un ecran dedie.

### Principe
Quand l'utilisateur tape "C'est parti !" sur l'ecran resultat, la session est sauvegardee en arriere-plan (silencieux, ne bloque jamais la validation). Chaque entree contient le titre, la description, les tags, le contexte de la session et les liens d'actions.

### Ecran liste (`/(main)/history`)
- `FlatList` avec pagination infinie (20 items par page)
- Pull-to-refresh
- Chaque carte affiche : emoji du tag principal, titre, date formatee (`Intl.DateTimeFormat`), description tronquee
- Empty state avec `MogogoMascot`
- Accessible via le bouton 📜 dans le header

### Ecran detail (`/(main)/history/[id]`)
- Date complete, titre, description
- Tags en chips
- Boutons d'actions (reutilisent `openAction()` de `@/services/places`)
- Bouton de suppression avec confirmation (`Alert.alert`)

### Service (`src/services/history.ts`)
- `saveSession(params)` : insert via Supabase client (RLS). Inclut `session_id` optionnel pour lier aux appels LLM
- `fetchHistory(page)` : select pagine (20 items), trie par `created_at DESC`
- `fetchSessionById(id)` : select par ID
- `deleteSession(id)` : delete via Supabase client (RLS)

### Hook (`src/hooks/useHistory.ts`)
- State : `sessions`, `loading`, `error`, `hasMore`
- `loadMore()` : pagination infinie
- `refresh()` : pull-to-refresh (remet page a 0)
- `remove(id)` : suppression locale + Supabase

## 5. Logique du Moteur de Decision (LLM)

L'application ne possede pas de base de donnees d'activites. Elle delegue la logique au LLM.

### Gestion des interactions

| Action Utilisateur | Choix envoye | Comportement du LLM |
| :--- | :--- | :--- |
| **Option A ou B** | `"A"` / `"B"` | Avance dans la branche logique pour affiner le choix. |
| **Peu importe** | `"any"` | Neutralise le critere actuel et passe a une autre dimension de choix. |
| **Aucune des deux** | `"neither"` | **Pivot Contextuel** : comportement adapte selon la profondeur (voir section dediee ci-dessous). |
| **Autre suggestion** | `"reroll"` | Le LLM renvoie une nouvelle recommandation finale dans la **meme thematique/branche** que la precedente (ex: si "Faire des macarons", proposer une autre patisserie, pas un escape game). Ne repropose jamais exactement la meme activite. **Limite a 1 reroll par session** (client + serveur). |
| **Affiner** | `"refine"` | Le LLM pose exactement 3 questions ciblees pour affiner la recommandation, puis renvoie un resultat ajuste. |
| **Forcer le resultat** | `"finalize"` | Disponible apres 3 questions repondues. Le LLM doit immediatement finaliser avec une recommandation concrete basee sur les choix deja faits. Aucune question supplementaire. |

### Suivi de branche hierarchique

Le LLM maintient un chemin hierarchique dans `metadata.current_branch` (ex: `"Sortie > Cinema > Comedie"`) et un compteur de profondeur dans `metadata.depth` (1 = racine).

- **Choix A/B** : ajoute l'option choisie au chemin et incremente `depth`
- **Pivot (neither)** : si `depth >= 2`, remonte d'un niveau dans le chemin et propose de nouvelles sous-options

### Pivot Contextuel ("neither") & Time Travel

Le comportement du pivot depend de la profondeur dans l'arbre de decision :

| Condition | Comportement |
| :--- | :--- |
| `depth == 1` (rejet racine) | **Pivot lateral complet** : change totalement d'angle d'attaque (ex: si Q1 etait Finalite, explore via Logistique ou Vibe) |
| `depth >= 2` (rejet sous-noeud) | **Pivot intra-categorie** : l'utilisateur rejette ces sous-options precises mais aime la categorie parente. Reste dans le theme et propose des alternatives radicalement differentes au sein de ce meme theme |

**Injection de directive** : lors d'un "neither", une directive systeme est injectee dans les messages avant le choix utilisateur pour guider le LLM selon le contexte de profondeur. Cette directive explicite le chemin hierarchique, la profondeur, et la categorie parente a conserver (si `depth >= 2`).

**Comportement cote client** : "Aucune des deux" envoie l'historique complet au LLM avec `choice: "neither"`. La logique de profondeur (directive systeme injectee cote serveur) determine le comportement : pivot intra-categorie a `depth >= 2`, pivot lateral complet a `depth == 1`. L'historique n'est pas tronque — le LLM recoit le contexte complet pour pivoter intelligemment.

### Timeline Horizontale (Fil d'Ariane)

Les ecrans funnel et resultat affichent une **timeline horizontale scrollable** (breadcrumb) au-dessus du contenu. Elle permet de visualiser le parcours et d'effectuer un time travel vers n'importe quel noeud passe.

- **Affichage** : chips cliquables separees par un separateur `✦`, dans un `ScrollView` horizontal avec auto-scroll a droite
- **Contenu** : chaque chip affiche le label de l'option choisie (ex: "Cinema", "Comedie") — seuls les choix A/B sont affiches
- **Time travel** : taper une chip tronque l'historique jusqu'a ce noeud, puis re-appelle le LLM avec `choice: "neither"` pour obtenir de nouvelles options alternatives a ce point de decision
- **Visibilite** : le breadcrumb n'apparait que s'il y a au moins un choix A/B dans l'historique. Present sur le funnel ET sur l'ecran resultat (les deux phases)
- **Desactive** : les chips sont desactivees pendant le chargement

### Regle du "Breakout" (Sortie de secours)
* **Declencheur** : Apres **3 pivots consecutifs** (3 clics sur "Aucune des deux").
* **Action** : Le LLM abandonne le mode binaire et renvoie un **Top 3** d'activites variees basees sur le contexte global.

### Convergence
Le LLM doit converger vers une recommandation finale en **3 a 5 questions** maximum.

### Adaptation a l'age des enfants
Si le contexte contient `children_ages`, le LLM adapte **strictement** ses recommandations a la tranche d'age specifiee : activites adaptees a l'age, securite, interet pour les enfants concernes. Un enfant de 2 ans ne fait pas d'escape game, un ado de 15 ans ne veut pas aller au parc a balles. Cette regle est injectee dans le SYSTEM_PROMPT et l'information d'age est traduite en texte lisible dans `describeContext()` (ex: "Enfants de 3 a 10 ans").

### Regles de fiabilite
Le LLM ne doit **jamais** :
- Inventer des noms d'etablissements locaux (sauf enseignes iconiques/chaines connues)
- Mentionner des evenements specifiques avec des dates
- Inventer des titres d'oeuvres ; il peut mentionner des titres connus
- En cas de doute, il doit preferer une description generique

## 6. Actions Riches & Grounding

Le LLM peut renvoyer un tableau d'**actions** dans la recommandation finale. Chaque action ouvre un lien vers le service adapte.

### Types d'actions

| Type | Service | URL generee |
| :--- | :--- | :--- |
| `maps` | Google Maps | `https://www.google.com/maps/search/{query}/@{lat},{lng},14z` |
| `steam` | Steam Store | `https://store.steampowered.com/search/?term={query}` |
| `play_store` | Google Play Store | `https://play.google.com/store/search?q={query}` |
| `youtube` | YouTube | `https://www.youtube.com/results?search_query={query}` |
| `streaming` | Google (streaming) | `https://www.google.com/search?q={query}+streaming` |
| `spotify` | Spotify | `https://open.spotify.com/search/{query}` |
| `web` | Google Search | `https://www.google.com/search?q={query}` |

### Migration legacy
Si le LLM renvoie un `google_maps_query` sans `actions`, le client cree automatiquement une action `maps` a partir de ce champ.

## 7. Architecture Technique & Securite

* **Frontend** : React Native (Expo SDK 54) + TypeScript + expo-router v6
* **Backend** : Supabase (Auth, PostgreSQL, Edge Functions Deno)
* **IA** : LLM via abstraction multi-provider (OpenAI-compatible + Gemini natif avec cache contexte). Detection automatique du provider selon le modele/URL. **Dual-model optionnel** : fast model pour le funnel, big model pour la finalisation
* **Cartographie** : Google Maps via deep link
* **Authentification** : Google OAuth (obligatoire). Apple Sign-In prevu (placeholder "Coming soon").
* **Securite** : Les cles API (LLM, Google) sont stockees en variables d'environnement sur Supabase. L'app mobile ne parle qu'a l'Edge Function.
* **Session** : expo-secure-store (natif) / localStorage (web)

### Systeme de Quotas (Anti-Derive)
Le controle est effectue **cote serveur** (Edge Function) avant chaque appel au LLM :
* **Utilisateur Gratuit** : Limite a **500 requetes** / mois.
* **Utilisateur Premium** : Limite a **5000 requetes** / mois.
* **Reset automatique** : mensuel (comparaison mois/annee de `last_reset_date`).
* **Gestion** : Si quota atteint, l'Edge Function renvoie une erreur **429** avec un message i18n. L'app affiche un message amical.

### Systeme de Plumes (Monnaie Virtuelle)
Les plumes sont une monnaie virtuelle consommee au lancement de chaque session de decision (premier appel LLM uniquement).

| Aspect | Detail |
| :--- | :--- |
| **Solde initial** | 5 plumes |
| **Refill** | 5 plumes/jour, automatique (comparaison `last_refill_date < CURRENT_DATE`) |
| **Consommation** | 1 plume par nouvelle session (pas sur les appels suivants de la meme session) |
| **Premium** | Pas de consommation (bypass complet) |
| **Verrouillage** | `SELECT ... FOR UPDATE` pour eviter les race conditions |
| **Erreur** | 403 `no_plumes` avec message i18n si solde a 0 |

#### Fonction SQL `check_and_consume_plume(p_user_id UUID)`
- `SECURITY DEFINER` pour appel depuis le `service_role`
- Si `plan = 'premium'` → return true (bypass)
- Si `last_refill_date < CURRENT_DATE` → refill a 5 puis consomme 1 (solde = 4)
- Si `plumes_balance > 0` → decremente et return true
- Sinon → return false

#### Cote client
- **Badge** `PlumeBadge` dans le header : affiche 🪶 + solde (ou `∞` si premium), animation bounce quand le solde change, rouge si 0
- **Blocage** : le bouton "C'est parti" sur l'ecran contexte est desactive si 0 plumes, avec message explicatif
- **Callback** : `FunnelProvider` accepte `onPlumeConsumed` pour rafraichir le badge apres le premier appel LLM reussi
- **Hook** `useProfile()` : expose `{ profile, plumes, loading, reload }` avec calcul du solde effectif (refill client-side, `Infinity` pour premium)

### Variables d'environnement

| Cote | Variable | Description |
| :--- | :--- | :--- |
| Expo | `EXPO_PUBLIC_SUPABASE_URL` | URL du projet Supabase |
| Expo | `EXPO_PUBLIC_SUPABASE_ANON_KEY` | Cle anonyme Supabase |
| Edge Function | `LLM_API_URL` | URL de l'API LLM (ex: `http://localhost:11434/v1` pour Ollama, `https://generativelanguage.googleapis.com/v1beta` pour Gemini, `https://openrouter.ai/api/v1` pour OpenRouter) |
| Edge Function | `LLM_MODEL` | Modele LLM (ex: `llama3:8b`, `gemini-2.5-flash`, `anthropic/claude-sonnet-4-5-20250929`) |
| Edge Function | `LLM_API_KEY` | Cle API LLM (ex: `AIza...` pour Gemini, `sk-or-...` pour OpenRouter) |
| Edge Function | `LLM_PROVIDER` | (Optionnel) Override du provider : `openai`, `gemini` ou `openrouter`. Si absent, detection automatique |
| Edge Function | `LLM_CACHE_TTL` | (Optionnel) TTL du cache contexte Gemini en secondes (defaut: 3600). 0 pour desactiver |
| Edge Function | `LLM_FINAL_API_URL` | (Optionnel) URL de l'API du big model pour la finalisation. Si absent, le fast model fait tout |
| Edge Function | `LLM_FINAL_MODEL` | (Optionnel) Modele du big model (ex: `anthropic/claude-sonnet-4-5-20250929`). Requis avec `LLM_FINAL_API_URL` |
| Edge Function | `LLM_FINAL_API_KEY` | (Optionnel) Cle API du big model |

## 8. Modele de Donnees (SQL Supabase)

```sql
CREATE TABLE public.profiles (
  id uuid REFERENCES auth.users ON DELETE CASCADE PRIMARY KEY,
  full_name text,
  plan text DEFAULT 'free' CHECK (plan IN ('free', 'premium')),
  requests_count int DEFAULT 0,
  last_reset_date timestamp with time zone DEFAULT timezone('utc'::text, now()),
  plumes_balance integer NOT NULL DEFAULT 5,
  last_refill_date date NOT NULL DEFAULT CURRENT_DATE,
  updated_at timestamp with time zone DEFAULT timezone('utc'::text, now())
);

ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users can view own profile" ON public.profiles FOR SELECT USING (auth.uid() = id);
```

**Trigger** : `handle_new_user()` insere automatiquement une ligne dans `profiles` apres creation d'un utilisateur (recupere `full_name` depuis `raw_user_meta_data`).

### Table `user_preferences` (Grimoire)

```sql
CREATE TABLE public.user_preferences (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id uuid REFERENCES auth.users ON DELETE CASCADE NOT NULL,
  tag_slug text NOT NULL,
  score integer DEFAULT 1 CHECK (score >= 0 AND score <= 100),
  updated_at timestamptz DEFAULT timezone('utc', now()),
  UNIQUE (user_id, tag_slug)
);

ALTER TABLE public.user_preferences ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users can view own preferences" ON public.user_preferences FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "Users can insert own preferences" ON public.user_preferences FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users can update own preferences" ON public.user_preferences FOR UPDATE USING (auth.uid() = user_id);
CREATE POLICY "Users can delete own preferences" ON public.user_preferences FOR DELETE USING (auth.uid() = user_id);
CREATE INDEX idx_user_preferences_user_id ON public.user_preferences(user_id);
```

Le CRUD s'effectue cote client via la anon key + RLS (pas besoin de passer par l'Edge Function).

### Table `sessions_history` (Historique)

```sql
CREATE TABLE public.sessions_history (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id uuid REFERENCES auth.users ON DELETE CASCADE NOT NULL,
  created_at timestamptz DEFAULT timezone('utc', now()) NOT NULL,
  activity_title text NOT NULL,
  activity_description text NOT NULL,
  activity_tags text[] DEFAULT '{}',
  context_snapshot jsonb NOT NULL,
  action_links jsonb DEFAULT '[]'::jsonb
);

ALTER TABLE public.sessions_history ENABLE ROW LEVEL SECURITY;
CREATE POLICY "select_own" ON public.sessions_history FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "insert_own" ON public.sessions_history FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "delete_own" ON public.sessions_history FOR DELETE USING (auth.uid() = user_id);
CREATE INDEX idx_sessions_history_user_created ON public.sessions_history(user_id, created_at DESC);
```

Le CRUD s'effectue cote client via la anon key + RLS. Sauvegarde automatique a la validation, suppression manuelle depuis l'ecran detail.

La colonne `session_id` (uuid, nullable) permet de lier une session validee aux appels LLM correspondants dans `llm_calls`.

### Table `llm_calls` (Token Tracking)

```sql
CREATE TABLE public.llm_calls (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id uuid REFERENCES auth.users ON DELETE CASCADE NOT NULL,
  session_id uuid NOT NULL,
  prompt_tokens integer,
  completion_tokens integer,
  total_tokens integer,
  model text,
  choice text,
  is_prefetch boolean DEFAULT false,
  created_at timestamptz DEFAULT timezone('utc', now()) NOT NULL
);

ALTER TABLE public.llm_calls ENABLE ROW LEVEL SECURITY;
CREATE POLICY "select_own" ON public.llm_calls FOR SELECT USING (auth.uid() = user_id);
CREATE INDEX idx_llm_calls_session ON public.llm_calls(session_id);
CREATE INDEX idx_llm_calls_user_created ON public.llm_calls(user_id, created_at DESC);
```

Chaque appel LLM (y compris les prefetch) est enregistre avec les tokens consommes. L'insertion est faite en **fire-and-forget** par l'Edge Function via le `service_role` (pas de policy INSERT necessaire cote client). Les colonnes `prompt_tokens`, `completion_tokens` et `total_tokens` sont **nullables** car certains providers (ex: Ollama local) ne renvoient pas toujours `usage`.

Le `session_id` est genere cote client (UUID) au demarrage de chaque session funnel (`SET_CONTEXT`). Si absent, l'Edge Function genere un UUID de fallback via `crypto.randomUUID()`.

## 9. Contrat d'Interface (JSON Strict)

Le LLM doit repondre exclusivement dans ce format :

```json
{
  "statut": "en_cours | finalise",
  "phase": "questionnement | pivot | breakout | resultat",
  "mogogo_message": "Phrase sympathique du hibou magicien",
  "question": "Texte court (max 80 chars)",
  "options": {
    "A": "Label A",
    "B": "Label B"
  },
  "recommandation_finale": {
    "titre": "Nom de l'activite",
    "explication": "Pourquoi Mogogo a choisi cela",
    "actions": [
      {
        "type": "maps | steam | play_store | youtube | streaming | spotify | web",
        "label": "Texte du bouton",
        "query": "Requete optimisee pour le service cible"
      }
    ],
    "tags": ["nature", "sport"]
  },
  "metadata": {
    "pivot_count": 0,
    "current_branch": "Sortie > Cinema > Comedie",
    "depth": 3
  }
}
```

### Regles de validation
- `statut` : `"en_cours"` ou `"finalise"` (requis)
- `phase` : `"questionnement"`, `"pivot"`, `"breakout"` ou `"resultat"` (requis)
- `mogogo_message` : string (requis)
- Si `statut = "en_cours"` : `question` et `options` requis
- Si `statut = "finalise"` : `recommandation_finale` requis avec `titre`, `explication`, `actions[]` et `tags[]` (1-3 slugs parmi le catalogue)
- `metadata` : `pivot_count` (number), `current_branch` (string, chemin hierarchique ex: `"Sortie > Cinema"`) et `depth` (number, 1 = racine) requis

### Normalisation des breakouts
Le LLM renvoie parfois les breakouts dans un format non-standard. La validation normalise ces reponses automatiquement :
- **Breakout en array** : si `phase = "breakout"` et pas de `recommandation_finale`, le champ `breakout` ou `breakout_options` (array de `{titre, explication, actions}`) est converti en `recommandation_finale` (titres joints par " / ", explications concatenees, actions fusionnees)
- **Statut incorrect** : si `phase = "breakout"` et `statut = "en_cours"` avec une `recommandation_finale` presente, le statut est corrige en `"finalise"`
- Cette normalisation est appliquee a 3 niveaux : Edge Function (serveur), `llm.ts` (client), et CLI de test

## 10. Types TypeScript

### Types principaux (`src/types/index.ts`)

```typescript
type ActionType = "maps" | "web" | "steam" | "play_store" | "youtube" | "streaming" | "spotify";

interface Action {
  type: ActionType;
  label: string;
  query: string;
}

interface LLMResponse {
  statut: "en_cours" | "finalise";
  phase: "questionnement" | "pivot" | "breakout" | "resultat";
  mogogo_message: string;
  question?: string;
  options?: { A: string; B: string };
  recommandation_finale?: {
    titre: string;
    explication: string;
    google_maps_query?: string;  // Legacy
    actions: Action[];
    tags?: string[];             // Slugs thematiques (Grimoire)
  };
  metadata: {
    pivot_count: number;
    current_branch: string;
    depth?: number;
  };
  _model_used?: string;    // Injected by Edge Function
  _usage?: { prompt_tokens: number; completion_tokens: number; total_tokens: number };  // Injected by Edge Function
}

interface UserContext {
  social: string;
  energy: number;
  budget: string;
  environment: string;
  location?: { latitude: number; longitude: number };
  timing?: string;    // "now" ou "YYYY-MM-DD"
  language?: string;  // "fr" | "en" | "es"
  children_ages?: { min: number; max: number };  // 0-16, conditionnel a social="family"
}

type FunnelChoice = "A" | "B" | "neither" | "any" | "reroll" | "refine" | "finalize";

interface FunnelHistoryEntry {
  response: LLMResponse;
  choice?: FunnelChoice;
  choiceLabel?: string;   // Label de l'option choisie (ex: "Cinema") — rempli pour A/B
}

interface Profile {
  id: string;
  full_name: string | null;
  plan: "free" | "premium";
  requests_count: number;
  last_reset_date: string;
  plumes_balance: number;
  last_refill_date: string;
  updated_at: string;
}

interface UserPreference {
  id: string;
  user_id: string;
  tag_slug: string;
  score: number;        // 0–100
  updated_at: string;
}

interface TagDisplay {
  slug: string;
  emoji: string;
  labelKey: string;     // Cle i18n
}

interface SessionHistory {
  id: string;
  user_id: string;
  created_at: string;
  activity_title: string;
  activity_description: string;
  activity_tags: string[];
  context_snapshot: UserContext;
  action_links: Action[];
  session_id?: string;         // Lien vers llm_calls
}
```

## 11. Internationalisation (i18n)

### Langues supportees
- **Francais** (`fr`) - langue par defaut
- **Anglais** (`en`)
- **Espagnol** (`es`)

### Detection automatique
1. Preference sauvegardee dans AsyncStorage (cle `mogogo_language`)
2. Fallback : langue de l'appareil (expo-localization)
3. Fallback final : `"en"`

### Portee
- **UI** : tous les textes de l'interface (i18next + react-i18next)
- **LLM** : instruction systeme forcant la langue de reponse (injection dans l'Edge Function)
- **Contexte** : traduction des cles machine vers texte lisible pour le LLM (ex: `solo` → "Alone" en anglais)

### Cles machine contexte (`src/i18n/contextKeys.ts`)
Mapping entre cles machine envoyees au LLM et chemins i18n pour l'affichage :
- `SOCIAL_KEYS` : `["solo", "friends", "couple", "family"]`
- `BUDGET_KEYS` : `["free", "budget", "standard", "luxury"]`
- `ENVIRONMENT_KEYS` : `["indoor", "outdoor", "any_env"]`

## 12. Theme (Mode sombre)

### Preferences
- `"system"` : suit le theme de l'appareil
- `"light"` : theme clair force
- `"dark"` : theme sombre force

### Stockage
Preference sauvegardee dans AsyncStorage (cle `mogogo_theme`).

### Couleurs

| Token | Light | Dark |
| :--- | :--- | :--- |
| `primary` | `#6C3FC5` | `#9B7ADB` |
| `background` | `#FFFFFF` | `#121212` |
| `surface` | `#F5F0FF` | `#1E1A2E` |
| `text` | `#333333` | `#E8E8E8` |
| `textSecondary` | `#666666` | `#A0A0A0` |
| `border` | `#DDDDDD` | `#333333` |

### Context (`src/contexts/ThemeContext.tsx`)
Expose `colors`, `preference`, `setPreference()`, `isDark` via `useTheme()`.

## 13. UX / UI Mobile

### Navigation (Expo Router)

```
app/
├── _layout.tsx          → AuthGuard + ThemeProvider + Stack
├── index.tsx            → Accueil (mascotte + bouton "Commencer")
├── (auth)/
│   ├── _layout.tsx      → Stack sans header
│   └── login.tsx        → Google OAuth + Apple (placeholder)
└── (main)/
    ├── _layout.tsx      → FunnelProvider + useGrimoire + useProfile + Stack avec header (🪶 + 📜 + 📖 + ⚙️)
    ├── context.tsx      → Saisie contexte (chips + date picker + GPS + bouton Grimoire)
    ├── funnel.tsx       → Entonnoir A/B (coeur de l'app)
    ├── result.tsx       → Resultat final (2 phases : validation → deep links + sauvegarde historique)
    ├── grimoire.tsx     → Ecran Grimoire (gestion des tags thematiques)
    ├── history/
    │   ├── index.tsx    → Liste historique (FlatList pagine + pull-to-refresh)
    │   └── [id].tsx     → Detail session (actions + suppression)
    └── settings.tsx     → Langue + Theme + Deconnexion
```

### AuthGuard (`app/_layout.tsx`)
- Pas de session + dans `(main)` → redirection vers `/(auth)/login`
- Session active + dans `(auth)` → redirection vers `/(main)/context`
- Spinner pendant le chargement de la session

### Ecran Contexte
- **Chips** de selection pour social, budget, environment
- **Slider** ou chips pour energie (1-5)
- **Date picker** natif (inline iOS, calendar Android) pour le timing
- **Geolocalisation** automatique avec indicateur visuel

### Ecran Funnel
- Appel LLM initial au montage (sans choix)
- **Timeline horizontale** (breadcrumb) en haut de l'ecran : chips cliquables avec le label de chaque choix A/B passe, separees par `✦`. Tap sur une chip → time travel vers ce noeud (tronque + re-appel LLM avec `neither`). N'apparait que s'il y a au moins un choix A/B dans l'historique.
- Animation **fade** (300ms) entre les questions
- Boutons A / B + "Montre-moi le resultat !" (conditionnel, apres 3 questions) + "Peu importe" + "Aucune des deux"
- "Aucune des deux" envoie l'historique complet au LLM — la directive de profondeur cote serveur gere le pivot (intra-categorie a depth >= 2, lateral complet a depth == 1)
- Footer : "Revenir" (si historique non vide) + "Recommencer"
- Detection quota (429) et plumes epuisees (403) avec messages dedies

#### Transitions animees (latence percue)
- **Pas de remplacement brutal** : pendant le chargement, la question precedente reste visible avec opacite reduite (0.4) au lieu d'etre remplacee par un ecran de chargement plein
- **Overlay spinner** : un `ActivityIndicator` en overlay fade-in au centre de l'ecran, sans masquer le contenu
- **Bouton choisi mis en evidence** : le bouton A ou B presse reste visible avec une bordure primary (`chosen`), les boutons non-choisis se fondent (`faded`, opacite 0.3)
- **Boutons secondary masques** : "Peu importe", "Aucune des deux", "Montre-moi le resultat" disparaissent pendant le loading pour simplifier l'ecran
- **Preview SSE** : si le streaming est actif, le `mogogo_message` du LLM s'affiche dans la bulle mascotte des qu'il est recu (avant la reponse complete), remplacant le message precedent en temps reel
- **Crossfade** : quand la nouvelle reponse arrive, animation fade classique (300ms)

### Ecran Resultat (2 phases)

**Phase 1 — Avant validation** :
- **Breadcrumb** (fil d'Ariane) en haut de l'ecran (position absolue) : meme composant `DecisionBreadcrumb` que le funnel, cliquable pour time travel
- Mascotte avec `mogogo_message`
- Card : titre + explication
- CTA principal : **"C'est parti !"** (gros bouton primary)
- Ghost buttons discrets : "Affiner" (si pas deja fait) + "Autre suggestion" (si pas deja fait, limite a 1 reroll par session)
- Pas d'actions de deep linking visibles

**Phase 2 — Apres tap "C'est parti !"** :
- **Breadcrumb** (fil d'Ariane) en debut de scroll, cliquable pour time travel
- Confettis lances (`react-native-confetti-cannon`)
- `boostTags(recommendation.tags)` appele en background (Grimoire)
- `saveSession(...)` appele en background (Historique, silencieux)
- Mogogo dit : "Excellent choix ! Je le note dans mon grimoire pour la prochaine fois !"
- **Actions de deep linking** en boutons normaux (bordure violet, bien visibles)
- Bouton **"Partager mon Destin"** (contour violet, miniature du parchemin a gauche, spinner pendant le partage)
- Bouton "Recommencer" en bas
- Le **Parchemin du Destin** (image composee) est genere hors-ecran pour le partage uniquement (pas affiche)

### Ecran Grimoire
- Mascotte avec message de bienvenue
- **Tags actifs** : chips avec emoji + label + score, supprimables (tap → suppression)
- **Tags disponibles** : grille des tags non encore ajoutes, cliquables pour ajouter
- Accessible via : bouton 📖 dans le header (toutes les pages) ou bouton "Mon Grimoire" sur l'ecran contexte

### Ecran Historique
- **Liste** : `FlatList` avec pagination infinie (20 items), pull-to-refresh, empty state avec `MogogoMascot`
- Chaque carte affiche : emoji du tag principal, titre, date formatee, description tronquee (2 lignes)
- Tap → ecran detail avec date complete, titre, description, tags en chips, boutons d'actions, bouton supprimer
- Accessible via le bouton 📜 dans le header (toutes les pages)

### Ecran Settings
- Selection langue (fr/en/es) avec drapeaux
- Selection theme (system/light/dark)
- Bouton deconnexion

### Composants

| Composant | Role |
| :--- | :--- |
| `ChoiceButton` | Bouton A/B avec variantes `primary`/`secondary`, feedback haptique (`expo-haptics`), animation scale au tap (0.95→1), props `faded` (opacite 0.3, non-interactif) et `chosen` (bordure primary) |
| `MogogoMascot` | Image mascotte (80x80) + bulle de message |
| `LoadingMogogo` | Animation rotative (4 WebP) + spinner + **messages progressifs** (changent au fil du temps : 0s→1.5s→3.5s→6s) avec transition fade. Si un message fixe est passe, pas de progression |
| `PlumeBadge` | Badge 🪶 + solde (ou ∞ premium), animation bounce, rouge si 0 |
| `DecisionBreadcrumb` | Timeline horizontale scrollable : chips cliquables (label du choix) separees par `✦`, auto-scroll, LayoutAnimation |
| `AgeRangeSlider` | Range slider a deux poignees (PanResponder + Animated) pour la tranche d'age enfants (0-16 ans), conditionnel a social=family |
| `DestinyParchment` | Image partageable : fond parchemin + titre + metadonnees + mascotte thematique. Zone de texte positionnee sur la zone utile du parchemin (280,265)→(810,835) sur l'image 1080x1080, polices dynamiques proportionnelles a la taille du wrapper |

### Mascotte : assets

| Fichier | Usage |
| :--- | :--- |
| `mogogo-waiting.png` | Accueil, bulle mascotte (statique) |
| `mogogo-writing.webp` | Loading (animation) |
| `mogogo-dancing.webp` | Loading (animation) |
| `mogogo-running.webp` | Loading (animation) |
| `mogogo-joy.webp` | Loading (animation) |

Les animations de chargement tournent cycliquement (index global incremente a chaque instanciation).

### Parchemin du Destin : assets et partage

| Fichier | Usage |
| :--- | :--- |
| `destiny-parchment/background.webp` | Texture parchemin transparente (overlay) |
| `destiny-parchment/mogogo-chill.webp` | Mascotte variante detente/nature/creatif/voyage/tech |
| `destiny-parchment/mogogo-cinema.webp` | Mascotte variante cinema/culture |
| `destiny-parchment/mogogo-eat.webp` | Mascotte variante gastronomie |
| `destiny-parchment/mogogo-party.webp` | Mascotte variante fete/musique/social/insolite |
| `destiny-parchment/mogogo-sport.webp` | Mascotte variante sport/jeux |

**Mapping tags → variantes** (`src/utils/mascotVariant.ts`) : chaque tag du catalogue est associe a une des 5 variantes. Le premier tag de la recommandation determine la mascotte affichee. Fallback : `chill`.

**Flux de partage** (`src/hooks/useShareParchment.ts`) :
1. Capture de la View `DestinyParchment` via `react-native-view-shot` (JPG qualite 0.9)
2. iOS/Android : `expo-sharing.shareAsync()` ouvre la ShareSheet native
3. Web : Web Share API si disponible, sinon download du fichier

## 14. State Management : FunnelContext

### State (`src/contexts/FunnelContext.tsx`)

```typescript
interface FunnelState {
  context: UserContext | null;
  sessionId: string | null;              // UUID genere au SET_CONTEXT, lie aux llm_calls
  history: FunnelHistoryEntry[];
  currentResponse: LLMResponse | null;
  loading: boolean;
  error: string | null;
  pivotCount: number;
  lastChoice?: FunnelChoice;
  prefetchedResponses: {                  // Reponses pre-chargees pour A et B
    A?: LLMResponse;
    B?: LLMResponse;
  } | null;
}
```

### Actions du reducer
- `SET_CONTEXT` : definit le contexte utilisateur et genere un `sessionId` (UUID)
- `SET_LOADING` : active/desactive le chargement
- `SET_ERROR` : definit une erreur
- `SET_PREFETCHED` : stocke les reponses pre-chargees pour A et B
- `PUSH_RESPONSE` : empile la reponse courante dans l'historique (avec `choiceLabel` si choix A/B), remplace par la nouvelle, efface `prefetchedResponses`
- `POP_RESPONSE` : depile la derniere reponse (backtracking local, sans appel LLM), efface prefetch
- `JUMP_TO_STEP` : tronque l'historique jusqu'a l'index donne, restaure la reponse du noeud cible comme `currentResponse`, recalcule `pivotCount`, efface prefetch
- `RESET` : reinitialise tout l'etat

### API exposee via `useFunnel()`

| Fonction | Description |
| :--- | :--- |
| `state` | Etat complet du funnel |
| `setContext(ctx)` | Definit le contexte et demarre le funnel |
| `makeChoice(choice)` | Envoie un choix au LLM (inclut les preferences Grimoire). Si une reponse prefetchee existe pour A/B, l'utilise instantanement. Sinon, appel LLM standard. Apres chaque reponse `en_cours`, lance le prefetch A/B en arriere-plan |
| `reroll()` | Appelle `makeChoice("reroll")` |
| `refine()` | Appelle `makeChoice("refine")` |
| `jumpToStep(index)` | **Time travel** : tronque l'historique jusqu'a `index`, re-appelle le LLM avec `choice: "neither"` sur le noeud cible |
| `goBack()` | Backtracking local (POP_RESPONSE) |
| `reset()` | Reinitialise le funnel |

### Logique pivot_count
- Incremente sur phase `"pivot"`
- Reinitialise a 0 sur phase `"questionnement"`
- Conserve la valeur sur les autres phases

### Props du FunnelProvider
- `preferencesText?: string` — injectee par le layout principal via `useGrimoire()` + `formatPreferencesForLLM()`. Passee a `callLLMGateway` a chaque appel.
- `onPlumeConsumed?: () => void` — callback appele apres le premier appel LLM reussi d'une session, pour rafraichir le badge plumes dans le header.

## 15. Service LLM (`src/services/llm.ts`)

### Configuration
- Timeout : **30 000 ms**
- Max retries : **1** (erreurs reseau pures uniquement — pas de retry sur reponse vide ou JSON invalide)
- Retry delay : **1 000 ms**
- Erreurs retryables : 502, timeout, network

### Appel
```typescript
async function callLLMGateway(params: {
  context: UserContext;
  history?: FunnelHistoryEntry[];
  choice?: FunnelChoice;
  preferences?: string;     // Texte Grimoire formate
  session_id?: string;      // UUID de la session funnel (token tracking)
}, options?: {
  signal?: AbortSignal;                    // Annulation externe
}): Promise<LLMResponse>
```

- Appel via `supabase.functions.invoke("llm-gateway", ...)` (mode non-streaming)
- Retry automatique (1x) sur erreurs 502/timeout/network

### Prefetch speculatif A/B
```typescript
async function prefetchLLMChoices(params: {
  context: UserContext;
  history: FunnelHistoryEntry[];
  currentResponse: LLMResponse;
  preferences?: string;
  session_id?: string;      // UUID de la session funnel (token tracking)
}, signal?: AbortSignal): Promise<{ A?: LLMResponse; B?: LLMResponse }>
```

- Lance 2 appels LLM en `Promise.allSettled()` (un pour A, un pour B)
- Envoie `prefetch: true` dans le body (cote serveur : pas d'incrementation de quota)
- Pas de retry (le prefetch est opportuniste)
- Support `AbortController` pour annulation (back/reset/jumpToStep)
- Retourne les reponses disponibles (les echecs sont ignores)

### Validation (`validateLLMResponse`)
- Verification stricte de la structure JSON
- Normalisation breakouts : conversion `breakout`/`breakout_options` array → `recommandation_finale`, correction `statut` "en_cours" → "finalise" (voir section 9)
- Migration automatique `google_maps_query` → `actions[]` si absent
- Normalisation `tags` : array de strings, fallback `[]`
- Erreur 429 → message quota traduit via i18n
- Erreur 403 → message plumes epuisees traduit via i18n

## 16. Edge Function (`supabase/functions/llm-gateway/index.ts`)

### Abstraction Provider LLM (`providers.ts`)

L'Edge Function utilise une abstraction multi-provider pour les appels LLM, definie dans `providers.ts` :

**Interface commune** :
```typescript
interface LLMCallParams {
  model: string;
  messages: Array<{ role: string; content: string }>;
  temperature: number;
  maxTokens: number;
  jsonMode?: boolean;  // defaut: true
}

interface LLMCallResult {
  content: string;
  usage?: { prompt_tokens: number; completion_tokens: number; total_tokens: number };
  model: string;
}

interface LLMProvider {
  call(params: LLMCallParams): Promise<LLMCallResult>;
}
```

**Providers disponibles** :

| Provider | Detection auto | API | Auth |
| :--- | :--- | :--- | :--- |
| **OpenAIProvider** | Tout modele non-Gemini, non-OpenRouter | `POST {url}/chat/completions` | `Authorization: Bearer {key}` |
| **GeminiProvider** | `LLM_MODEL` commence par `gemini-` ou `LLM_API_URL` contient `googleapis.com` | `POST .../models/{model}:generateContent` | `x-goog-api-key: {key}` |
| **OpenRouterProvider** | `LLM_API_URL` contient `openrouter.ai` | `POST {url}/chat/completions` | `Authorization: Bearer {key}` + `HTTP-Referer` + `X-Title` |

**Factory** : `createProvider(apiUrl, model, apiKey)` auto-detecte le provider. Override possible via `LLM_PROVIDER=openai|gemini|openrouter`.

**Mapping des formats OpenAI → Gemini** :

| OpenAI | Gemini natif |
| :--- | :--- |
| `messages[role=system].content` | `systemInstruction.parts[].text` (tous les messages system concatenes) |
| `messages[role=user].content` | `contents[role=user].parts[].text` |
| `messages[role=assistant].content` | `contents[role=model].parts[].text` |
| `max_tokens` | `generationConfig.maxOutputTokens` |
| `response_format: { type: "json_object" }` | `generationConfig.responseMimeType: "application/json"` |
| `choices[0].message.content` | `candidates[0].content.parts[0].text` |
| `usage.prompt_tokens` | `usageMetadata.promptTokenCount` |

### Cache contexte Gemini

Le GeminiProvider utilise le **cache contexte explicite** de l'API Gemini pour eviter de renvoyer le system prompt (~3-4K tokens) a chaque requete.

**Cycle de vie** :
1. **Premier appel** : creation d'un `CachedContent` via `POST .../v1beta/cachedContents` avec le system prompt complet
2. **Appels suivants** : passage du `cachedContent: "{name}"` dans le body, sans renvoyer le `systemInstruction`
3. **Expiration** : si le cache expire (verif `expireTime - 60s`), il est recree automatiquement
4. **Erreur cache** : si l'appel avec cache echoue (400/404), retry automatique sans cache + invalidation

**Configuration** :
- TTL : configurable via `LLM_CACHE_TTL` (defaut: 3600 secondes = 1 heure). 0 pour desactiver
- Minimum de tokens pour le cache Gemini : 1024 (Flash) / 4096 (Pro)
- Etat du cache en variables module (persiste entre les requetes dans l'Edge Function Supabase — instance long-lived)

**Benefices** :
- Reduction de la latence (~200-400ms par appel : le system prompt n'est pas re-traite)
- Reduction du cout (~50% sur les input tokens du system prompt apres le premier appel)

### Routage dual-model (optionnel)

Si les variables `LLM_FINAL_API_URL` et `LLM_FINAL_MODEL` sont configurees, l'Edge Function utilise deux modeles LLM :

| Scenario | Provider utilise |
| :--- | :--- |
| Premier appel, choix A/B, neither, refine | **Fast model** (`LLM_MODEL`) |
| `choice = "reroll"` ou `"finalize"` | **Big model** (`LLM_FINAL_MODEL`) directement |
| Fast model retourne `statut: "finalise"` (convergence naturelle) | Interception → re-appel **big model** |
| Fast model retourne `phase: "breakout"` | Interception → re-appel **big model** |

**Interception** : quand le fast model finalise naturellement, l'Edge Function re-appelle le big model avec le meme historique + une directive de finalisation. En cas d'echec du big model, degradation gracieuse : la reponse du fast model est conservee.

**Retro-compatibilite** : si `LLM_FINAL_*` ne sont pas configures (`hasBigModel === false`), le comportement est 100% identique a avant.

**System prompt adaptatif** : le system prompt est adapte au tier du modele actif via `getSystemPrompt(activeModel)`.

**max_tokens adaptatif** : 2000 pour les steps intermediaires (fast model), 3000 pour les finalisations (big model ou finalize/reroll).

### DiscoveryState (tier "explicit")

Pour les petits modeles (tier "explicit", ex: gemini-2.5-flash-lite), le serveur pre-digere l'etat de la session et donne au modele une instruction unique et claire. Le serveur decide (question, pivot, finalisation, breakout), le modele execute.

**Fichier** : `supabase/functions/_shared/discovery-state.ts` (auto-contenu, aucun import pour compatibilite Deno + Node/tsx).

**Q1 pre-construite** : pour le premier appel, le serveur retourne directement la Q1 basee sur le contexte social, sans appeler le LLM :
- Seul/Couple → "Creer vs Consommer"
- Amis → "Cocon vs Aventure"
- Famille → "Calme vs Defoulement"

Chaque variante sociale a un pool de 4 `mogogo_message` pioches aleatoirement (FR/EN/ES). Latence zero, format garanti.

**Convergence cote serveur** : au lieu de laisser le modele decider quand finaliser :
- `depth < 3` → instruction "Pose une question A/B..."
- `depth == 3` → instruction "Pose une DERNIERE question..."
- `depth >= 4` → instruction "Finalise avec une activite concrete..."
- `pivot_count >= 3` → instruction "Breakout Top 3..."
- `choice === "neither"` → instruction pivot (intra-categorie si `depth >= 2`, complet sinon)

**Prompt simplifie** (~800 chars) : identite Mogogo, format JSON strict avec 2 exemples, regles de fiabilite/plateforme. Les sections retirees (ANGLE Q1, CONVERGENCE, NEITHER/PIVOT, REROLL, BRANCH, RAPPEL CRITIQUE) sont gerees par le serveur.

**Messages** : 2-4 messages (system prompt + etat session + instruction) au lieu de 2+2N dans le mode classique.

**Scope** : tier "explicit" uniquement. Les tiers compact/standard gardent le fonctionnement classique. `isDirectFinal` (reroll/finalize) et `refine` → toujours routes vers le mode classique (big model si configure).

| Aspect | Avant (explicit classique) | Apres (DiscoveryState) |
| :--- | :--- | :--- |
| Q1 latence | ~2-5s (appel LLM) | 0ms (pre-construite) |
| Tokens input | ~1500-2000 | ~400-600 (~-65%) |
| Messages | 2 + 2N (N = steps) | 2-4 (fixe) |
| Convergence | Le modele decide (souvent mal) | Le serveur decide (deterministe) |

### Limite reroll

**Cote serveur** : avant l'appel LLM, si `choice === "reroll"` et que l'historique contient deja un reroll, l'Edge Function retourne une erreur 429 (`reroll_limit`).

**Cote client** : le bouton "Autre suggestion" dans `result.tsx` est masque apres 1 reroll (`hasRerolled` derive de `state.history`).

### Pipeline de traitement
1. **Authentification + body parsing** : `Promise.all(getUser(token), req.json())` — parallelises
2. **Quotas + plumes** : `Promise.all(profiles.select(), check_and_consume_plume())` — parallelises. La plume n'est verifiee que pour le premier appel de session (`history` vide)
3. **Limite reroll** : si `choice === "reroll"` et historique contient deja un reroll → erreur 429
4. **Court-circuit Q1 (tier explicit)** : si `tier === "explicit"` et premier appel → retour immediat de la Q1 pre-construite (aucun appel LLM, 0ms). Inject plumes/model, incremente compteur, log dans `llm_calls` avec `model: "pre-built-q1"`
5. **Cache premier appel** : si `history` vide et pas de `choice` (tiers non-explicit), calcul d'un hash SHA-256 du contexte + preferences + langue. Si cache hit → reponse instantanee (TTL 10 min, max 100 entrees LRU en memoire)
6. **Construction du prompt** :
   - **Mode DiscoveryState** (tier explicit, pas finalize/reroll/refine) : prompt simplifie + etat session pre-digere + instruction serveur (2-4 messages)
   - **Mode classique** (tiers compact/standard, ou finalize/reroll/refine) : system prompt adapte au tier du modele actif
   - Instruction de langue (si non-francais)
   - Contexte utilisateur traduit via `describeContext()`
   - Enrichissement temporel (si date precise)
   - **Preferences Grimoire** (message system, si presentes)
   - **Historique compresse** : chaque entree n'envoie que `{q, A, B, phase, branch, depth}` au lieu du JSON complet (~100 chars vs ~500 par step)
   - **Directive pivot contextuel** (message system, si choix = "neither") : calcul de la profondeur (`depth`) a partir des choix consecutifs A/B dans l'historique, puis injection d'une directive adaptee (pivot intra-categorie si `depth >= 2`, pivot complet si `depth == 1`)
   - **Directive finalisation** (message system, si choix = "finalize") : ordonne au LLM de repondre immediatement avec `statut: "finalise"`, `phase: "resultat"` et une `recommandation_finale` concrete basee sur l'historique des choix
   - Choix courant
7. **Routage dual-model** : selection du provider (fast ou big) selon le choix et la configuration
8. **Appel LLM** : via `provider.call(...)` (OpenAI, Gemini ou OpenRouter selon la detection). Le provider gere l'adaptation du format, l'authentification, et le cache contexte Gemini le cas echeant
9. **Interception big model** : si fast model finalise et big model configure → re-appel big model (degradation gracieuse en cas d'echec)
10. **Incrementation** : `requests_count++` en fire-and-forget **apres** l'appel LLM (pas pour les prefetch `prefetch: true`)
11. **Token tracking** : extraction de `usage` de la reponse provider, insertion fire-and-forget dans `llm_calls` avec `modelUsed` (tous les appels, y compris prefetch)
12. **Cache** : sauvegarde de la reponse dans le cache si premier appel
13. **Retour** : `JSON.parse()` strict (pas de reparation) + `_plumes_balance` + `_usage` (tokens consommes) + `_model_used` (modele reel ayant genere la reponse) + reponse au client

### Configuration LLM
- `temperature` : 0.7
- `max_tokens` adaptatif : **2000** pour les steps intermediaires (fast model), **3000** pour finalize/reroll et big model
- `response_format` : `{ type: "json_object" }`
- Pas de reparation JSON (`tryRepairJSON` supprimee) : le LLM doit renvoyer du JSON valide directement. `JSON.parse()` strict
- **Dual-model** : si `LLM_FINAL_*` configures, le fast model (`LLM_MODEL`) gere le funnel et le big model (`LLM_FINAL_MODEL`) gere les finalisations

### Cache LRU (premier appel)
- **Cle** : SHA-256 de `JSON.stringify({context, preferences, lang})`
- **TTL** : 10 minutes
- **Capacite** : 100 entrees maximum (eviction LRU)
- **Scope** : uniquement le premier appel (pas d'historique, pas de choix, pas de prefetch)
- **Contenu** : reponse LLM sans `_plumes_balance` (ajoute dynamiquement a chaque hit)

### Prefetch speculatif
Quand `prefetch: true` est present dans le body :
- L'appel est traite normalement (construction du prompt, appel LLM, validation)
- Le compteur de requetes n'est **pas** incremente
- Pas de consommation de plume (le prefetch n'est jamais un premier appel de session)

### Traduction contexte pour le LLM
L'Edge Function contient des tables de traduction `CONTEXT_DESCRIPTIONS` pour convertir les cles machine (ex: `solo`) en texte lisible pour le LLM selon la langue (ex: "Seul" en FR, "Alone" en EN, "Solo/a" en ES).

## 17. CLI de Test (`scripts/cli-session.ts`)

Outil en ligne de commande pour jouer des sessions completes sans app mobile ni Supabase.

### Modes d'execution

| Mode | Flag | Description |
| :--- | :--- | :--- |
| Interactif | *(defaut)* | Prompt readline, saisie A/B/neither/any/reroll + `/back [N]` pour time travel |
| Batch | `--batch` | Choix predetermines via `--choices "A,B,A"` |
| Auto | `--auto` | Un second LLM joue le role de l'utilisateur |

### Mode auto
- `--persona "..."` : decrit l'intention simulee de l'utilisateur fictif
- Un appel LLM separe (temperature 0.3) determine le choix a chaque etape
- Parsing multi-niveaux de la reponse (patterns explicites, lettres isolees, fallback "A")

### Options principales
```
--context '{...}'           Contexte JSON complet
--social, --energy, --budget, --env   Contexte par champs
--children-ages "min,max"  Tranche d'age enfants (ex: "3,10")
--timing "now"|"YYYY-MM-DD" Timing
--lang fr|en|es            Langue LLM (defaut: fr)
--choices "A,B,..."        Choix predetermines (batch)
--json                     Sortie JSON sur stdout (logs sur stderr)
--transcript <path>        Sauvegarde session JSON
--prompt-file <path>       System prompt alternatif
--max-steps N              Limite steps (defaut 20)
```

### Configuration
Variables via `.env.cli` ou environnement :
- `LLM_API_URL` (defaut : `http://localhost:11434/v1`) — fast model
- `LLM_MODEL` (defaut : `gpt-oss:120b-cloud`) — fast model
- `LLM_API_KEY` (optionnel) — fast model
- `LLM_FINAL_API_URL` (optionnel) — big model pour les finalisations
- `LLM_FINAL_MODEL` (optionnel) — big model (requis avec `LLM_FINAL_API_URL`)
- `LLM_FINAL_API_KEY` (optionnel) — big model
- `LLM_PROVIDER` (optionnel : `openai`, `gemini` ou `openrouter`, sinon auto-detection)
- `LLM_CACHE_TTL` (optionnel, defaut : 3600. TTL du cache contexte Gemini)
- `LLM_TEMPERATURE` (defaut : 0.7)
- Utilise la meme abstraction provider que l'Edge Function (`scripts/lib/llm-providers.ts`)
- Detection automatique Gemini si `LLM_MODEL` commence par `gemini-`, OpenRouter si `LLM_API_URL` contient `openrouter.ai`
- Pas de retry (un seul appel, erreur directe en cas d'echec)
- Pas de reparation JSON (`tryRepairJSON` supprimee) : `JSON.parse()` strict
- `max_tokens` adaptatif : **2000** (intermediaire), **3000** (finalize/reroll/big model)
- **Dual-model** : meme logique que l'Edge Function — fast model pour le funnel, big model pour les finalisations. Interception automatique si le fast model converge. Limite reroll a 1 par session
- Le banner affiche `Fast model` et `Big model` si configure

### Time travel (`/back [N]`)
En mode interactif, l'utilisateur peut taper `/back [N]` (ou `/back` sans argument pour le dernier noeud) :
- L'historique est tronque jusqu'a l'index `N`
- Le LLM est re-appele avec `choice: "neither"` sur le noeud cible
- Un breadcrumb `📍 label1 > label2 > ...` est affiche apres chaque step pour visualiser le chemin parcouru

### Compatibilite
Support des modeles classiques (`content`) et des modeles a raisonnement (`reasoning`).

## 18. Optimisation de la Latence LLM

La chaine de latence typique est : tap utilisateur → Edge Function (auth + quota) → LLM API (2-8s) → parsing JSON → retour client. Le traitement LLM represente ~80% de la latence. Cinq niveaux d'optimisation sont en place pour reduire la latence reelle et percue.

### Niveau 1 : Parallelisation serveur
- `getUser(token)` et `req.json()` en `Promise.all()`
- Quota check et plume check en `Promise.all()`
- Increment du compteur en **fire-and-forget** apres l'appel LLM
- Solde plumes lu depuis le profil deja charge (pas d'appel DB supplementaire)
- **Gain** : ~150-350ms par appel

### Niveau 2 : Optimisation du prompt
- System prompt condense (~900 tokens au lieu de ~1500)
- Historique compresse : `{q, A, B, phase, branch, depth}` (~100 chars/step vs ~500)
- `max_tokens` adaptatif (2000 intermediaire, 3000 final)

### Niveau 3 : UX performance percue
- **Transitions animees** : la question precedente reste visible pendant le chargement (opacite reduite) au lieu d'un ecran de loading plein. Overlay spinner en fade-in
- **Messages progressifs** (LoadingMogogo) : 4 messages qui evoluent au fil du temps (0s, 1.5s, 3.5s, 6s) — transforme l'attente en narration Mogogo
- **Feedback haptique** (`expo-haptics`) et animation scale au tap sur les boutons
- **Bouton choisi mis en evidence** : le bouton presse reste visible avec bordure primary, les autres se fondent
- **Gain** : ~1-2s de latence percue en moins

### Niveau 4 : Cache et prefetch
- **Cache premier appel** : hash SHA-256 du contexte, cache LRU en memoire (TTL 10 min, max 100 entrees). Reponse instantanee si cache hit
- **Prefetch speculatif A/B** : apres chaque reponse `en_cours`, les choix A et B sont pre-calcules en arriere-plan. Si l'utilisateur choisit A ou B et que la reponse est deja prefetchee, elle est affichee instantanement
- Le prefetch n'incremente pas les quotas (`prefetch: true` dans le body)
- Le prefetch est annule automatiquement sur back/reset/jumpToStep via `AbortController`
- **Gain** : reponse instantanee (~70% des choix A/B). Cout : x2 en tokens LLM

### Niveau 5 : Cache contexte Gemini
- **Cache explicite du system prompt** via l'API `cachedContents` de Gemini (uniquement avec le GeminiProvider)
- Le system prompt (~3-4K tokens) est mis en cache cote Google au premier appel, puis reference par son `name` aux appels suivants
- TTL configurable via `LLM_CACHE_TTL` (defaut: 3600s). Le cache est recree automatiquement a l'expiration
- Le cache est en variables module (persiste entre les requetes dans l'Edge Function long-lived)
- **Gain** : ~200-400ms par appel + ~50% de reduction des couts sur les input tokens du system prompt

### Messages de chargement progressifs (i18n)

| Delai | FR | EN | ES |
| :--- | :--- | :--- | :--- |
| 0s | Mogogo analyse ton choix... | Mogogo is analyzing your choice... | Mogogo analiza tu eleccion... |
| 1.5s | Mogogo explore les possibilites... | Mogogo is exploring possibilities... | Mogogo explora las posibilidades... |
| 3.5s | Mogogo a presque trouve... | Mogogo almost found it... | Mogogo casi lo encontro... |
| 6s | Mogogo fouille ses grimoires les plus anciens... | Mogogo is searching through ancient spellbooks... | Mogogo busca en sus grimorios mas antiguos... |

## 19. Benchmark de Modeles (`scripts/benchmark-models.ts`)

Outil en ligne de commande pour tester la vitesse et la coherence des reponses JSON de differents modeles LLM.

### Usage
```bash
npx tsx scripts/benchmark-models.ts model1 model2 model3
npx tsx scripts/benchmark-models.ts --rounds 3 model1 model2
npx tsx scripts/benchmark-models.ts --api-url URL --api-key KEY model1
npx tsx scripts/benchmark-models.ts --json model1 model2
```

### Scenarios testes
| Scenario | Description | max_tokens |
| :--- | :--- | :--- |
| 1er appel | Premier appel avec contexte utilisateur (pas d'historique) | 2000 |
| Step intermediaire | Choix B apres une premiere question (depth 2) | 2000 |
| Finalisation | Resultat final apres 3 questions (directive finalize) | 2000 |

### Validations
- Structure JSON (champs obligatoires : `statut`, `phase`, `mogogo_message`, `metadata`)
- Contraintes de longueur (`mogogo_message` ≤ 120 chars, `question` ≤ 100 chars, options ≤ 60 chars)
- Coherence du `statut` par rapport au scenario (`en_cours` pour intermediaire, `finalise` pour finalisation)
- Presence de `recommandation_finale` avec `titre`, `explication`, `actions` pour les reponses finalisees
- Detection de langue (alerte si `mogogo_message` semble en anglais)
- Parsing JSON strict (`JSON.parse()`)

### Options
- `--rounds N` : nombre de rounds par scenario (defaut: 1, pour moyenner les temps)
- `--api-url URL` : URL de l'API LLM (defaut: depuis `.env.prod` ou `.env.cli`)
- `--api-key KEY` : cle API (defaut: depuis `.env.prod` ou `.env.cli`)
- `--timeout MS` : timeout par requete (defaut: 60000)
- `--json` : sortie JSON structuree sur stdout

### Provider
Utilise la meme abstraction provider que l'Edge Function et le CLI (`scripts/lib/llm-providers.ts`). Un provider est cree par modele teste : si le nom commence par `gemini-`, le GeminiProvider natif est utilise automatiquement ; si l'URL contient `openrouter.ai`, l'OpenRouterProvider ; sinon l'OpenAIProvider. Cela permet de benchmarker des modeles Gemini, OpenRouter et OpenAI-compatible dans la meme session.

### Sortie
- Tableau detaille par modele et scenario (latence, succes/echec, apercu de la reponse)
- Tableau recapitulatif avec latence moyenne, taux de succes, recommandation du meilleur modele
