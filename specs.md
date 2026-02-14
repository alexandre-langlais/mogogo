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
Le bouton "C'est parti" est desactive tant que **social**, **budget** et **environment** ne sont pas renseignes. L'energie a une valeur par defaut (3). Le timing vaut `"now"` par defaut.

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
- **Penalite** : -5 a chaque rejet "Pas pour moi" sur une recommandation contenant ces tags (plancher 0). Seuls les tags deja existants dans le Grimoire sont penalises (pas de creation de tag avec score negatif). Les slugs en entree sont dedupliques
- **Ajustement manuel** : l'utilisateur peut deplacer le curseur (slider 0-100, pas de 5) sur l'ecran Grimoire. Sauvegarde via `updateScore(slug, score)` au relachement du slider. Clamp 0-100 cote service + CHECK SQL
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
| **Pas pour moi** | `"reroll"` | L'utilisateur rejette la recommandation. Les tags de l'activite sont penalises (-5 dans le Grimoire) et ajoutes aux exclusions de session. Le LLM propose une alternative **differente mais dans la meme thematique** exploree pendant le funnel (les choix A/B definissent les preferences). **Limite a 1 par session** (client + serveur). Utilise le big model si configure. La reponse est pushee dans l'historique (backtracking possible). Apres un reroll, le resultat suivant est **auto-valide** (Phase 2 directe, pas de teaser). |
| **Affiner** | `"refine"` | Le LLM pose 2 a 3 questions ciblees pour affiner la recommandation, puis renvoie un resultat ajuste. **Limite a 1 refine par session** (client + serveur). Indisponible apres un reroll. |
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
Le LLM doit converger vers une recommandation finale en **`MIN_DEPTH - 1` a `MIN_DEPTH + 1` questions** (defaut : 3 a 5 avec `MIN_DEPTH=4`). La profondeur minimale avant finalisation est configurable via la variable d'environnement `MIN_DEPTH` (defaut: 4, minimum: 2).

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
* **Publicite** : Google AdMob (rewarded video, utilisateurs gratuits uniquement). Voir section 21
* **Monetisation** : RevenueCat (abonnement Premium + packs de plumes IAP). Voir sections 22-23
* **Economie** : Plumes magiques (10/session, 30/pub, 10/bonus quotidien, packs 100/300). Voir section 23
* **Authentification** : Google OAuth (obligatoire).
* **Securite** : Les cles API (LLM, Google) sont stockees en variables d'environnement sur Supabase. L'app mobile ne parle qu'a l'Edge Function.
* **Session** : expo-secure-store (natif) / localStorage (web)

### Systeme de Quotas (Anti-Derive)
Le controle est effectue **cote serveur** (Edge Function) avant chaque appel au LLM :
* **Utilisateur Gratuit** : Limite a **500 requetes** / mois.
* **Utilisateur Premium** : Limite a **5000 requetes** / mois.
* **Reset automatique** : mensuel (comparaison mois/annee de `last_reset_date`).
* **Gestion** : Si quota atteint, l'Edge Function renvoie une erreur **429** avec un message i18n. L'app affiche un message amical.

### Variables d'environnement

| Cote | Variable | Description |
| :--- | :--- | :--- |
| Expo | `EXPO_PUBLIC_SUPABASE_URL` | URL du projet Supabase |
| Expo | `EXPO_PUBLIC_SUPABASE_ANON_KEY` | Cle anonyme Supabase |
| Expo | `EXPO_PUBLIC_REVENUECAT_APPLE_KEY` | Cle API RevenueCat (iOS) |
| Expo | `EXPO_PUBLIC_REVENUECAT_GOOGLE_KEY` | Cle API RevenueCat (Android) |
| Edge Function | `LLM_API_URL` | URL de l'API LLM (ex: `http://localhost:11434/v1` pour Ollama, `https://generativelanguage.googleapis.com/v1beta` pour Gemini, `https://openrouter.ai/api/v1` pour OpenRouter) |
| Edge Function | `LLM_MODEL` | Modele LLM (ex: `llama3:8b`, `gemini-2.5-flash`, `anthropic/claude-sonnet-4-5-20250929`) |
| Edge Function | `LLM_API_KEY` | Cle API LLM (ex: `AIza...` pour Gemini, `sk-or-...` pour OpenRouter) |
| Edge Function | `LLM_PROVIDER` | (Optionnel) Override du provider : `openai`, `gemini` ou `openrouter`. Si absent, detection automatique |
| Edge Function | `LLM_CACHE_TTL` | (Optionnel) TTL du cache contexte Gemini en secondes (defaut: 3600). 0 pour desactiver |
| Edge Function | `LLM_FINAL_API_URL` | (Optionnel) URL de l'API du big model pour la finalisation. Si absent, le fast model fait tout |
| Edge Function | `LLM_FINAL_MODEL` | (Optionnel) Modele du big model (ex: `anthropic/claude-sonnet-4-5-20250929`). Requis avec `LLM_FINAL_API_URL` |
| Edge Function | `LLM_FINAL_API_KEY` | (Optionnel) Cle API du big model |
| Edge Function | `MIN_DEPTH` | (Optionnel) Profondeur minimale avant finalisation (defaut: 4, minimum: 2). Controle le nombre de questions du funnel |

## 8. Modele de Donnees (SQL Supabase)

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

### Table `device_plumes` (Economie de plumes)

```sql
CREATE TABLE public.device_plumes (
  device_id text PRIMARY KEY,
  plumes_count integer NOT NULL DEFAULT 30,
  last_daily_reward_at timestamptz DEFAULT NULL,
  is_premium boolean DEFAULT false,
  created_at timestamptz DEFAULT now() NOT NULL,
  updated_at timestamptz DEFAULT now() NOT NULL,
  CONSTRAINT plumes_count_non_negative CHECK (plumes_count >= 0)
);

ALTER TABLE public.device_plumes ENABLE ROW LEVEL SECURITY;
CREATE POLICY "select_authenticated" ON public.device_plumes FOR SELECT USING (auth.role() = 'authenticated');
CREATE POLICY "insert_service_role" ON public.device_plumes FOR INSERT WITH CHECK (auth.role() = 'service_role');
CREATE POLICY "update_service_role" ON public.device_plumes FOR UPDATE USING (auth.role() = 'service_role');
```

Table liee a l'identifiant physique du telephone (pas au `user_id`). Persiste meme si l'utilisateur supprime et recree son compte. Pas de policy DELETE → table immuable.

**Constantes d'economie** :
| Constante | Valeur | Description |
| :--- | :--- | :--- |
| `PLUMES_DEFAULT` | 30 | Plumes offertes au premier lancement |
| `PLUMES_SESSION_COST` | 10 | Cout d'une session (consomme a la finalisation) |
| `PLUMES_AD_REWARD` | 30 | Plumes gagnees en regardant une pub |
| `PLUMES_DAILY_REWARD` | 10 | Bonus quotidien (1x par 24h) |
| `PLUMES_PACK_SMALL` | 100 | Pack IAP petit sac |
| `PLUMES_PACK_LARGE` | 300 | Pack IAP grand coffre |

**RPCs (SECURITY DEFINER)** :
- `get_device_plumes(p_device_id)` → `integer` : retourne le solde (auto-cree avec 30 si absent)
- `get_device_plumes_info(p_device_id)` → `TABLE(plumes_count, last_daily_reward_at, is_premium)` : info complete en un appel (auto-cree si absent)
- `consume_plumes(p_device_id, p_amount)` → `integer` : decremente atomiquement. Si `is_premium = true` → retourne 999999. Si solde insuffisant → retourne -1
- `credit_plumes(p_device_id, p_amount)` → `integer` : UPSERT + credit atomique (default 30 + amount)
- `claim_daily_reward(p_device_id)` → `integer` : verifie `last_daily_reward_at + 24h < now()`. Si OK → +10 plumes, met a jour timestamp, retourne nouveau solde. Sinon → retourne -1
- `set_device_premium(p_device_id, p_is_premium)` → `void` : UPSERT `is_premium`

**Cote client** : `getDeviceId()` (`src/services/deviceId.native.ts`) retourne un identifiant stable du device via `expo-application` :
- Android : `Application.getAndroidId()` (persiste across reinstall)
- iOS : `Application.getIosIdForVendorAsync()`
- Web : `null` (pas de plumes sur web)

Le `device_id` est passe dans chaque appel `callLLMGateway` et `prefetchLLMChoices`. L'Edge Function consomme 10 plumes en fire-and-forget a la premiere finalisation d'une session (reroll/refine exclus, premium exclus, prefetch exclus). Un pre-check verifie le solde >= 10 avant l'appel LLM pour les finalisations probables.

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
    "justification": "Micro-phrase ≤60 chars, POURQUOI pour cet utilisateur",
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
- Si `statut = "finalise"` : `recommandation_finale` requis avec `titre`, `explication`, `justification` (optionnel, ≤60 chars, micro-phrase personnalisee justifiant le lien entre le contexte utilisateur et la recommandation), `actions[]` et `tags[]` (1-3 slugs parmi le catalogue)
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
    justification?: string;      // ≤60 chars, micro-phrase personnalisee (ex: "Parfait pour ton energie niveau 4 !")
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
│   └── login.tsx        → Google OAuth
└── (main)/
    ├── _layout.tsx      → FunnelProvider + useGrimoire + useProfile + Tabs (Mogogo, Grimoire, Historique, Reglages)
    ├── context.tsx      → Saisie contexte (chips + date picker + GPS + bouton Grimoire)
    ├── funnel.tsx       → Entonnoir A/B (coeur de l'app)
    ├── result.tsx       → Resultat final (2 phases : validation → deep links + sauvegarde historique)
    ├── grimoire.tsx     → Ecran Grimoire (jauges + sliders pour ajuster les scores)
    ├── training.tsx     → Ecran Training (swipe de cartes pour calibrer les gouts, sans header)
    ├── history/
    │   ├── index.tsx    → Liste historique (FlatList pagine + pull-to-refresh)
    │   └── [id].tsx     → Detail session (actions + suppression)
    └── settings.tsx     → Langue + Theme + Training + Deconnexion
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
- Detection quota (429) avec message dedie

#### Transitions animees (latence percue)
- **Pas de remplacement brutal** : pendant le chargement, la question precedente reste visible avec opacite reduite (0.4) au lieu d'etre remplacee par un ecran de chargement plein
- **Overlay spinner** : un `ActivityIndicator` en overlay fade-in au centre de l'ecran, sans masquer le contenu
- **Bouton choisi mis en evidence** : le bouton A ou B presse reste visible avec une bordure primary (`chosen`), les boutons non-choisis se fondent (`faded`, opacite 0.3)
- **Boutons secondary masques** : "Peu importe", "Aucune des deux", "Montre-moi le resultat" disparaissent pendant le loading pour simplifier l'ecran
- **Preview SSE** : si le streaming est actif, le `mogogo_message` du LLM s'affiche dans la bulle mascotte des qu'il est recu (avant la reponse complete), remplacant le message precedent en temps reel
- **Crossfade** : quand la nouvelle reponse arrive, animation fade classique (300ms)

### Ecran Resultat (2 phases)

**Phase 1 — Teaser (avant validation)** :
- Mascotte avec `mogogo_message`
- Card :
  - **Titre** de l'activite
  - **Justification** (italique violet, si presente)
  - **Liste contexte** en 2 colonnes (`width: 47%`, `flexWrap: wrap`) : icones Ionicons + valeurs i18n des champs du formulaire (`people-outline` social, `wallet-outline` budget, `flash-outline` energie, `compass-outline` environnement)
  - **"On y va ?"** en gras, centre, sous la liste (`result.readyQuestion`)
- **Rangee de pouces** (centre, gap 24) :
  - **Pouce rouge** (gauche) : cercle 64px, `#E85D4A`, icone `thumbs-down`, ombre → `handleReroll()`. Haptics Medium (sauf web)
  - **Pouce vert** (droite) : cercle 64px, `#2ECC71`, icone `thumbs-up`, ombre, **animation pulse** (scale 1↔1.08, 300ms, Animated.loop) → `handleValidate()`. Haptics Medium (sauf web)
- Bouton primary **"Affiner ma recherche"** (si `!hasRefined && !hasRerolled`)
- Bouton secondary "Recommencer"
- Pas d'actions de deep linking visibles
- `LayoutAnimation.configureNext(easeInEaseOut)` avant `setValidated(true)` pour transition fluide
- `UIManager.setLayoutAnimationEnabledExperimental(true)` sur Android

**Auto-validation apres reroll** : si `hasRerolled === true`, le resultat saute la Phase 1 et passe directement en Phase 2 via `handleValidate()`. Le message mascotte est alors "Voici une activite alternative pour toi !" (`result.rerollResult`) au lieu de "Excellent choix !". Pas de confettis ni d'animation de validation

**Phase 2 — Apres validation** :
- Confettis lances (`react-native-confetti-cannon`, sauf si `hasRerolled`)
- `boostTags(recommendation.tags)` appele en background (Grimoire)
- `saveSession(...)` appele en background (Historique, silencieux)
- Mogogo dit : "Excellent choix ! Je le note dans mon grimoire pour la prochaine fois !" (ou `result.rerollResult` apres un reroll)
- Icone de partage dans le header : `arrow-redo-outline` en `colors.text` (raccord avec le titre)
- Card : titre + justification + explication + liste contexte (icones + i18n)
- **Actions de deep linking** en boutons normaux (bordure violet, bien visibles)
- Bouton **"Partager mon Destin"** (contour violet, miniature du parchemin a gauche, spinner pendant le partage)
- Bouton secondary **"Finalement non, autre chose ?"** (`result.tryAnother`) → `handleReroll()` — masque si `hasRerolled`
- Bouton secondary "Recommencer" en bas
- Le **Parchemin du Destin** (image composee) est genere hors-ecran pour le partage uniquement (pas affiche)

### Ecran Grimoire
- Mascotte avec message de bienvenue
- **Jauges d'affinite** : chaque tag actif est affiche sous forme de ligne avec emoji + label + score/100 + slider (0-100, pas de 5). Optimistic update local pendant le drag, sauvegarde au relachement via `updateScore()`. Bouton ✕ pour supprimer le tag
- **Hint** : texte discret "Deplace le curseur pour ajuster" sous les jauges
- **Tags disponibles** : grille des tags non encore ajoutes, cliquables pour ajouter
- Accessible via : bouton 📖 dans le header (toutes les pages) ou bouton "Mon Grimoire" sur l'ecran contexte

### Ecran Historique
- **Liste** : `FlatList` avec pagination infinie (20 items), pull-to-refresh, empty state avec `MogogoMascot`
- Chaque carte affiche : emoji du tag principal, titre, date formatee, description tronquee (2 lignes)
- Tap → ecran detail avec date complete, titre, description, tags en chips, boutons d'actions, bouton supprimer
- Accessible via le bouton 📜 dans le header (toutes les pages)

### Ecran Training (Rituel de Meditation du Hibou)
- **Swipe de cartes statiques** (15 cartes) pour calibrer les gouts de l'utilisateur sans appel LLM
- Chaque carte : emoji (72px), titre, description, chips tags (fond primary)
- **Swipe droit** (>80px) → `boostTags(card.tags)` fire-and-forget (like)
- **Swipe gauche** (<-80px) → `penalizeTags(card.tags)` fire-and-forget (dislike)
- Sinon → spring back. Animations : flyout 200ms, rotation ±12deg, overlays like/dislike (opacite interpolee), scale carte suivante 0.92→1, haptic feedback
- **Progression** : texte "3/15" + barre horizontale
- **Ecran de completion** : MogogoMascot + confetti + bouton retour + `AsyncStorage.setItem("mogogo_training_completed", "true")`
- **Bouton "Passer"** en bas pour quitter a tout moment
- **Rejouable** depuis Settings (scores cumulatifs avec caps, pas de risque d'inflation)
- **Pool de cartes** (`src/constants/trainingDeck.ts`) : 15 activites couvrant les 14 tags du catalogue
- **Onboarding modal** : sur l'ecran contexte au premier lancement (detection via AsyncStorage), modal avec MogogoMascot + boutons "Commencer le rituel" / "Plus tard". "Plus tard" desactive le re-popup mais le training reste accessible via Settings
- **Acces permanent** : section "Entrainement" dans Settings avec bouton "Calibrer mes gouts"

### Ecran Settings
- Selection langue (fr/en/es) avec drapeaux
- Selection theme (system/light/dark)
- Bouton "Calibrer mes gouts" (acces au training)
- Section "Abonnement" : statut premium, paywall, gestion d'abonnement, restauration (voir section 22)
- Bouton deconnexion
- Bouton suppression de compte (avec confirmation)

### Composants

| Composant | Role |
| :--- | :--- |
| `ChoiceButton` | Bouton A/B avec variantes `primary`/`secondary`, feedback haptique (`expo-haptics`), animation scale au tap (0.95→1), props `faded` (opacite 0.3, non-interactif) et `chosen` (bordure primary) |
| `MogogoMascot` | Image mascotte (80x80) + bulle de message |
| `LoadingMogogo` | Animation rotative (4 WebP) + spinner + **messages progressifs** (changent au fil du temps : 0s→1.5s→3.5s→6s) avec transition fade. Si un message fixe est passe, pas de progression |
| `DecisionBreadcrumb` | Timeline horizontale scrollable : chips cliquables (label du choix) separees par `✦`, auto-scroll, LayoutAnimation |
| `AgeRangeSlider` | Range slider a deux poignees (PanResponder + Animated) pour la tranche d'age enfants (0-16 ans), conditionnel a social=family |
| `DestinyParchment` | Image partageable : fond parchemin + titre + metadonnees + mascotte thematique. Zone de texte positionnee sur la zone utile du parchemin (280,265)→(810,835) sur l'image 1080x1080, polices dynamiques proportionnelles a la taille du wrapper |
| `TrainingCard` | Carte d'activite pour le training : emoji (72px) + titre + description + chips tags. Fond `surface`, borderRadius 20, shadow |
| `AdConsentModal` | Modale gate plumes (quand plumes insuffisantes). Affiche MogogoMascot + message "10 plumes necessaires, 30 gagnees par video" + bouton "Regarder une video" (primary) + bouton "Devenir Premium" (secondary) + message d'echec si video non regardee en entier (`adNotWatched`). Voir section 21 |
| `PlumesModal` | Boutique de plumes. Affiche solde courant + 4 items : regarder une video (+30), petit sac (100, IAP), grand coffre (300, IAP), magie infinie (premium). Masquee si premium |
| `PlumeCounter` | Compteur de plumes dans le header. Affiche `∞` si premium, `🪶 x {N}` sinon. Tap → ouvre `PlumesModal` |
| `DailyRewardBanner` | Banniere bonus quotidien sur l'ecran contexte. Si disponible : banniere doree "Bonus quotidien disponible !" + bouton "Recuperer +10 plumes". Si non dispo : texte discret "Prochain bonus dans HH:mm". Animation pulse au claim |

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
  excludedTags: string[];                 // Tags exclus pour le reste de la session (accumules via reroll "Pas pour moi")
  adShown: boolean;                        // Pub deja montree dans cette session (evite re-declenchement apres refine/reroll)
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
- `ADD_EXCLUDED_TAGS` : deduplique et fusionne les nouveaux tags dans `excludedTags`
- `SET_AD_SHOWN` : marque la pub comme montree pour cette session (`adShown = true`)
- `RESET` : reinitialise tout l'etat (y compris `excludedTags` et `adShown`)

### API exposee via `useFunnel()`

| Fonction | Description |
| :--- | :--- |
| `state` | Etat complet du funnel |
| `setContext(ctx)` | Definit le contexte et demarre le funnel |
| `makeChoice(choice)` | Envoie un choix au LLM (inclut les preferences Grimoire). Si une reponse prefetchee existe pour A/B, l'utilise instantanement. Sinon, appel LLM standard. Apres chaque reponse `en_cours`, lance le prefetch A/B en arriere-plan |
| `reroll()` | Rejette la recommandation ("Pas pour moi") : ajoute les tags aux exclusions de session (calcul local de `mergedExcluded` avant dispatch pour eviter le decalage stateRef), dispatch `ADD_EXCLUDED_TAGS`, puis appelle `callLLMGateway` avec `choice: "reroll"` et `excluded_tags`. Fonction standalone (ne delegue pas a `makeChoice`) |
| `refine()` | Appelle `makeChoice("refine")` |
| `jumpToStep(index)` | **Time travel** : tronque l'historique jusqu'a `index`, re-appelle le LLM avec `choice: "neither"` sur le noeud cible |
| `goBack()` | Backtracking local (POP_RESPONSE) |
| `reset()` | Reinitialise le funnel |
| `markAdShown()` | Marque la pub comme montree pour cette session (dispatch `SET_AD_SHOWN`) |

### Logique pivot_count
- Incremente sur phase `"pivot"`
- Reinitialise a 0 sur phase `"questionnement"`
- Conserve la valeur sur les autres phases

### Props du FunnelProvider
- `preferencesText?: string` — injectee par le layout principal via `useGrimoire()` + `formatPreferencesForLLM()`. Passee a `callLLMGateway` a chaque appel.

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
  excluded_tags?: string[]; // Tags exclus de la session (accumules via reroll "Pas pour moi")
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
  excluded_tags?: string[]; // Tags exclus de la session (accumules via reroll "Pas pour moi")
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

**System prompt adaptatif** : le system prompt est adapte au tier du modele actif et a la profondeur minimale via `getSystemPrompt(activeModel, MIN_DEPTH)`.

**max_tokens adaptatif** : 2000 pour les steps intermediaires (fast model), 3000 pour les finalisations (big model ou finalize/reroll).

### DiscoveryState (tier "explicit")

Pour les petits modeles (tier "explicit", ex: gemini-2.5-flash-lite), le serveur pre-digere l'etat de la session et donne au modele une instruction unique et claire. Le serveur decide (question, pivot, finalisation, breakout), le modele execute.

**Fichier** : `supabase/functions/_shared/discovery-state.ts` (auto-contenu, aucun import pour compatibilite Deno + Node/tsx).

**Q1 pre-construite** : pour le premier appel, le serveur retourne directement la Q1 basee sur le contexte social, sans appeler le LLM :
- Seul/Couple → "Creer vs Consommer"
- Amis → "Cocon vs Aventure"
- Famille → "Calme vs Defoulement"

Chaque variante sociale a un pool de 4 `mogogo_message` pioches aleatoirement (FR/EN/ES). Latence zero, format garanti.

**Convergence cote serveur** : au lieu de laisser le modele decider quand finaliser (seuils configures par `MIN_DEPTH`, defaut 4) :
- `depth < MIN_DEPTH - 1` → instruction "Pose une question A/B..."
- `depth == MIN_DEPTH - 1` → instruction "Pose une DERNIERE question..."
- `depth >= MIN_DEPTH` → instruction "Finalise avec une activite concrete..."
- `pivot_count >= 3` → instruction "Breakout Top 3..."
- `choice === "neither"` → instruction pivot (intra-categorie si `depth >= 2`, complet sinon)

**Prompt simplifie** (~800 chars) : identite Mogogo, format JSON strict avec 2 exemples, regles de fiabilite/plateforme. Les sections retirees (ANGLE Q1, CONVERGENCE, NEITHER/PIVOT, REROLL, BRANCH, RAPPEL CRITIQUE) sont gerees par le serveur.

**Messages** : 2-4 messages (system prompt + etat session + instruction) au lieu de 2+2N dans le mode classique.

**Exclusions session** : si `excluded_tags` est present et non-vide, les tags sont injectes dans les `constraints` du DiscoveryState (`EXCLUSIONS: sport, nature`) et en message system global dans le mode classique (`EXCLUSIONS SESSION : NE PAS proposer d'activites liees a : sport, nature.`).

**Scope** : tier "explicit" uniquement. Les tiers compact/standard gardent le fonctionnement classique. `isDirectFinal` (reroll/finalize) et `refine` → toujours routes vers le mode classique (big model si configure).

| Aspect | Avant (explicit classique) | Apres (DiscoveryState) |
| :--- | :--- | :--- |
| Q1 latence | ~2-5s (appel LLM) | 0ms (pre-construite) |
| Tokens input | ~1500-2000 | ~400-600 (~-65%) |
| Messages | 2 + 2N (N = steps) | 2-4 (fixe) |
| Convergence | Le modele decide (souvent mal) | Le serveur decide (deterministe) |

### Limites reroll et refine

**Cote serveur** : avant l'appel LLM, si `choice === "reroll"` ou `"refine"` et que l'historique contient deja un reroll/refine passe, l'Edge Function retourne une erreur 429 (`reroll_limit` / `refine_limit`). Note : le client inclut le choix courant dans la derniere entree de `history`, donc le serveur exclut la derniere entree (`slice(0, -1)`) pour ne compter que les actions passees.

**Cote client** :
- "Pas pour moi" (reroll) masque apres 1 reroll (`hasRerolled` derive de `state.history`). Le reroll penalise les tags de la recommandation rejetee (-5 dans le Grimoire) et les ajoute aux exclusions de session
- "Affiner" masque apres 1 refine (`hasRefined`) **ou** apres un reroll (`hasRerolled`)

**Post-refine** : apres un refine, le serveur injecte des directives pour forcer 2 a 3 questions ciblees avant finalisation. A >= 3 questions posees, une directive force la finalisation.

### Pipeline de traitement
1. **Authentification + body parsing** : `Promise.all(getUser(token), req.json())` — parallelises
2. **Quotas** : chargement du profil pour verification du plan
3. **Limites reroll/refine** : si `choice === "reroll"` ou `"refine"` et historique passe contient deja un reroll/refine → erreur 429
4. **Court-circuit Q1 (tier explicit)** : si `tier === "explicit"` et premier appel → retour immediat de la Q1 pre-construite (aucun appel LLM, 0ms). Incremente compteur, log dans `llm_calls` avec `model: "pre-built-q1"`
5. **Cache premier appel** : si `history` vide et pas de `choice` (tiers non-explicit), calcul d'un hash SHA-256 du contexte + preferences + langue. Si cache hit → reponse instantanee (TTL 10 min, max 100 entrees LRU en memoire)
6. **Construction du prompt** :
   - **Mode DiscoveryState** (tier explicit, pas finalize/reroll/refine) : prompt simplifie + etat session pre-digere + instruction serveur (2-4 messages)
   - **Mode classique** (tiers compact/standard, ou finalize/reroll/refine) : system prompt adapte au tier du modele actif
   - Instruction de langue (si non-francais)
   - Contexte utilisateur traduit via `describeContext()`
   - Enrichissement temporel (si date precise)
   - **Preferences Grimoire** (message system, si presentes)
   - **Exclusions session** (message system `EXCLUSIONS SESSION`, si `excluded_tags` non-vide)
   - **Historique compresse** : chaque entree n'envoie que `{q, A, B, phase, branch, depth}` au lieu du JSON complet (~100 chars vs ~500 par step)
   - **Directive pivot contextuel** (message system, si choix = "neither") : calcul de la profondeur (`depth`) a partir des choix consecutifs A/B dans l'historique, puis injection d'une directive adaptee (pivot intra-categorie si `depth >= 2`, pivot complet si `depth == 1`)
   - **Directive finalisation** (message system, si choix = "finalize") : ordonne au LLM de repondre immediatement avec `statut: "finalise"`, `phase: "resultat"` et une `recommandation_finale` concrete basee sur l'historique des choix
   - **Directive reroll / "Pas pour moi"** (message system, si choix = "reroll") : ordonne au LLM de proposer une alternative differente mais dans la meme thematique exploree pendant le funnel (les choix A/B definissent les preferences), tout en restant compatible avec le contexte (energie, budget, environnement). Inclut les tags a exclure si presents. Statut "finalise", phase "resultat", recommandation_finale. Aucune question
   - Choix courant
7. **Routage dual-model** : selection du provider (fast ou big) selon le choix et la configuration
8. **Appel LLM** : via `provider.call(...)` (OpenAI, Gemini ou OpenRouter selon la detection). Le provider gere l'adaptation du format, l'authentification, et le cache contexte Gemini le cas echeant
9. **Interception big model** : si fast model finalise et big model configure → re-appel big model (degradation gracieuse en cas d'echec)
10. **Incrementation** : `requests_count++` en fire-and-forget **apres** l'appel LLM (pas pour les prefetch `prefetch: true`)
11. **Token tracking** : extraction de `usage` de la reponse provider, insertion fire-and-forget dans `llm_calls` avec `modelUsed` (tous les appels, y compris prefetch)
12. **Cache** : sauvegarde de la reponse dans le cache si premier appel
13. **Retour** : `JSON.parse()` strict (pas de reparation) + `_usage` (tokens consommes) + `_model_used` (modele reel ayant genere la reponse) + reponse au client

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
- **Contenu** : reponse LLM brute

### Prefetch speculatif
Quand `prefetch: true` est present dans le body :
- L'appel est traite normalement (construction du prompt, appel LLM, validation)
- Le compteur de requetes n'est **pas** incremente

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
- `MIN_DEPTH` (optionnel, defaut : 4, minimum : 2) — profondeur minimale avant finalisation
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
- Quota check en parallele avec le parsing
- Increment du compteur en **fire-and-forget** apres l'appel LLM
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

## 20. Tests du Funnel (`scripts/test-funnel.ts`)

Suite de tests unitaires et d'integration pour la logique serveur du funnel (DiscoveryState, system prompts, Q1 pre-construite).

### Usage
```bash
npx tsx scripts/test-funnel.ts               # Tests unitaires seuls (instantane, pas de LLM)
npx tsx scripts/test-funnel.ts --integration  # Tests unitaires + integration (LLM requis via .env.cli)
```

### Tests unitaires (28 tests, sans LLM)

Testent `buildDiscoveryState()`, `getSystemPrompt()` et `buildFirstQuestion()` directement :

| Groupe | Tests |
| :--- | :--- |
| MIN_DEPTH configurable | depth < minDepth → question, depth = minDepth → finalise, minDepth variable |
| Neither transparent dans depth | Les choix "neither" ne comptent pas dans le calcul de profondeur |
| Neither pivot intra vs complet | depth >= 2 → pivot intra-categorie (RESTE), depth = 1 → pivot complet (racine) |
| "any" incremente la depth | Le choix "any" est compte comme A/B dans la profondeur |
| Post-refine comptage | 0/2 → "encore 2 questions", 1/2 → "encore 1", 2/3 → "DERNIERE", 3+ → finaliser |
| Post-refine titre injecte | Le titre de la recommandation affinee apparait dans l'instruction |
| Breakout apres 3 pivots | 3 "neither" dans l'historique → instruction breakout Top 3 |
| excludedTags dans constraints | Avec `excludedTags` → constraints contient "EXCLUSIONS" et les tags ; sans → pas d'EXCLUSIONS ; avec `[]` → pas d'EXCLUSIONS |
| getSystemPrompt avec minDepth | Le prompt explicit adapte les compteurs au minDepth (ex: "2 PREMIERES reponses" pour minDepth=3) |
| buildFirstQuestion | Contexte social → Q1 adaptee (Amis → cocon/aventure, Seul → creer/consommer) |

### Tests d'integration (10 assertions, avec LLM)

Jouent des sessions reelles via `buildDiscoveryState` + `buildExplicitMessages` + appel LLM :

| Test | Validations |
| :--- | :--- |
| Session A/B basique | Finalise en ~MIN_DEPTH steps, recommandation avec titre et actions |
| Neither + pivot intra-categorie | Apres neither : statut "en_cours", phase "pivot"/"questionnement" |
| Refine flow | Apres refine : pose des questions, puis finalise |
| Reroll | Reponse immediate "finalise" avec titre different du premier |

### Configuration
Memes variables que le CLI (`LLM_API_URL`, `LLM_MODEL`, `LLM_API_KEY`, `MIN_DEPTH`) via `.env.cli` ou environnement. Utilise la meme abstraction provider (`scripts/lib/llm-providers.ts`).

### Format de sortie
Format TAP-like : `✓`/`✗` par test + resume final. Code de sortie 1 si au moins un test echoue

## 21. Publicite (Google AdMob)

L'application affiche des publicites (rewarded video) pour les utilisateurs gratuits via Google AdMob. Les utilisateurs premium en sont exemptes automatiquement.

### Dependance
- `react-native-google-mobile-ads` v16 (plugin Expo config)

### Configuration Expo (`app.config.ts`)
Le plugin est declare avec les **App IDs de test Google** (a remplacer en production) :
```typescript
[
  "react-native-google-mobile-ads",
  {
    androidAppId: "ca-app-pub-3940256099942544~3347511713",  // Test
    iosAppId: "ca-app-pub-3940256099942544~1458002511",      // Test
  },
]
```

### Initialisation (`src/services/admob.ts` / `admob.native.ts`)

**Natif** (`admob.native.ts`) :
- Initialise le SDK au lancement de l'app (`initAdMob()` appele dans `app/_layout.tsx`)
- Configure `MaxAdContentRating.G` (contenu tout public)
- Exporte les **Ad Unit IDs de test** : rewarded Android `ca-app-pub-3940256099942544/5224354917`, iOS `ca-app-pub-3940256099942544/1712485313`
- `loadRewarded()` : prechargement d'une rewarded video (appele au montage du funnel)
- `showRewarded(): Promise<boolean>` : affichage de la rewarded video. Retourne `true` si la video est regardee en entier (reward earned), `false` si fermee avant la fin

**Web** (`admob.ts`) :
- Stub no-op : `initAdMob()` ne fait rien, `loadRewarded()` est un no-op, `showRewarded()` retourne `true`

### Rewarded video et economie de plumes

Chaque session consomme **10 plumes** a la premiere finalisation. Les nouveaux devices recoivent **30 plumes** gratuites (3 sessions). Les utilisateurs free peuvent gagner des plumes via :
- **Rewarded video** : +30 plumes (soit 3 sessions)
- **Bonus quotidien** : +10 plumes (1x par 24h)
- **Packs IAP** : 100 ou 300 plumes
- **Premium** : plumes infinies (pas de consommation)

**Pre-check cote serveur** : avant l'appel LLM, si la finalisation est probable et `plumes_count < 10` → erreur 402 (`no_plumes`). Le client affiche alors la modale `AdConsentModal` pour gagner des plumes ou passer Premium.

**Blocage** : le resultat n'est affiche que si l'utilisateur a suffisamment de plumes. La modale `AdConsentModal` est presentee avec un message expliquant que 10 plumes sont necessaires et qu'une video rapporte 30 plumes.

**Pub une seule fois par session** : le flag `adShown` dans le FunnelContext (reducer) est mis a `true` via `markAdShown()` des qu'on entre dans la logique de pub. Lors des finalisations suivantes (apres refine/reroll dans la meme session), le guard `state.adShown` court-circuite directement vers le resultat. Le flag est reinitialise a `false` uniquement lors d'un `RESET` (nouvelle session)

**Flux** (`app/(main)/home/funnel.tsx`) :
1. Au montage du funnel, si `!isPremium` → `loadRewarded()` (prechargement)
2. L'Edge Function pre-check les plumes avant la finalisation :
   - Si premium ou `is_premium` device-level → pas de check
   - Si `plumes_count < 10` → retourne 402 `no_plumes`
3. Le client gere `needsPlumes` (state du FunnelContext) :
   - Affiche `AdConsentModal` : "Mogogo a besoin de 10 plumes"
   - **"Regarder une video"** → `showRewarded()` → si `earned` → `creditAfterAd(30)` → retry la finalisation ; sinon → `loadRewarded()` + re-affiche avec message d'echec (`adNotWatched`)
   - **"Devenir Premium"** → `presentPaywall()` → si achat reussi, retry ; sinon, re-affiche la modale
4. A la finalisation : l'Edge Function consomme 10 plumes en fire-and-forget (`consume_plumes(device_id, 10)`)

Le systeme de plumes est lie a l'identifiant hardware du telephone (table `device_plumes`), pas au `user_id`. Cela empeche un utilisateur de contourner les limites en supprimant/recreant son compte.

### IDs de production
Les App IDs et Ad Unit IDs actuels sont des **IDs de test Google**. Avant la publication :
1. Creer un compte AdMob et enregistrer l'app (Android + iOS)
2. Remplacer les App IDs dans `app.config.ts`
3. Remplacer les Ad Unit IDs dans `src/services/admob.native.ts`

## 22. Achats In-App (RevenueCat)

L'application utilise RevenueCat pour gerer les achats in-app et l'abonnement Premium. RevenueCat orchestre les stores Apple/Google et expose un entitlement `premium` verifie cote client.

### Dependances
- `react-native-purchases` v9 — SDK RevenueCat natif
- `react-native-purchases-ui` v9 — Paywall et Customer Center pre-construits

### Configuration
Variables d'environnement Expo :
- `EXPO_PUBLIC_REVENUECAT_APPLE_KEY` — Cle API RevenueCat pour iOS
- `EXPO_PUBLIC_REVENUECAT_GOOGLE_KEY` — Cle API RevenueCat pour Android

### Service (`src/services/purchases.native.ts` / `purchases.ts`)

**Natif** (`purchases.native.ts`) :
- `initPurchases()` — Configure le SDK RevenueCat au lancement de l'app (`app/_layout.tsx`). Active `LOG_LEVEL.DEBUG` en `__DEV__`
- `identifyUser(userId)` — Associe le user Supabase a RevenueCat via `Purchases.logIn()`
- `logoutPurchases()` — Deconnecte l'utilisateur RevenueCat (appele lors du `signOut()`)
- `checkEntitlement()` — Verifie si l'entitlement `premium` est actif
- `presentPaywall()` — Affiche le paywall natif RevenueCat. Retourne `true` si achat ou restauration reussi
- `buyPlumesPack(productId)` — Achete un pack de plumes via IAP (`Purchases.purchasePackage`). Retourne `true` si achat reussi. Product IDs : `mogogo_plumes_100`, `mogogo_plumes_300`
- `presentCustomerCenter()` — Affiche le centre de gestion d'abonnement
- `restorePurchases()` — Restaure les achats. Retourne `true` si premium retrouve
- `syncPlanToSupabase(isPremium)` — Met a jour `profiles.plan` dans Supabase (`"premium"` ou `"free"`)
- `onCustomerInfoChanged(callback)` — Listener reactif sur les changements de statut (achat, expiration, etc.)

**Web** (`purchases.ts`) :
- Stubs no-op pour toutes les fonctions. `checkEntitlement()` retourne `false`, `buyPlumesPack()` retourne `false`

### Hook (`src/hooks/usePurchases.ts`)

Expose : `isPremium`, `loading`, `showPaywall()`, `showCustomerCenter()`, `restore()`

**Comportement** :
1. Au changement de `user.id` : `identifyUser()` → `checkEntitlement()` → `syncPlanToSupabase()`
2. Listener reactif `onCustomerInfoChanged` : met a jour `isPremium` + sync Supabase + reload profile
3. `showPaywall()` retourne `true` si achat reussi (sync + reload profile automatiques)
4. `restore()` restaure les achats et retourne le statut premium

### Integration

| Composant | Usage |
| :--- | :--- |
| `app/_layout.tsx` | `initPurchases()` au montage (fire-and-forget) |
| `src/hooks/useAuth.ts` | `logoutPurchases()` avant `signOut()` |
| `app/(main)/settings.tsx` | Section "Abonnement" : affiche statut premium, paywall, gestion, restauration |
| `app/(main)/home/funnel.tsx` | `isPremium` → skip rewarded video et navigation directe. Free avec plumes insuffisantes → modale de consentement (`AdConsentModal`) avec option "Devenir Premium" → `showPaywall()`. Video non regardee en entier → message d'echec + retry |

### Ecran Settings — Section Abonnement

**Si premium** :
- Badge "Premium actif" avec etoile
- Bouton "Gerer mon abonnement" → `showCustomerCenter()`

**Si free** :
- Bouton "Passer Premium" (fond primary, texte blanc) → `showPaywall()`
- Bouton "Restaurer mes achats" → `restore()`

## 23. Economie de Plumes

L'application utilise un systeme de "plumes magiques" comme monnaie virtuelle. Chaque session consomme des plumes, et l'utilisateur peut en gagner via publicite, bonus quotidien, achats in-app, ou en passant Premium.

### Constantes

| Constante | Valeur | Description |
| :--- | :--- | :--- |
| `PLUMES.DEFAULT` | 30 | Plumes initiales (nouveaux devices) |
| `PLUMES.SESSION_COST` | 10 | Cout par session (premiere finalisation) |
| `PLUMES.AD_REWARD` | 30 | Recompense rewarded video |
| `PLUMES.DAILY_REWARD` | 10 | Bonus quotidien (1x/24h) |
| `PLUMES.PACK_SMALL` | 100 | Pack IAP "Petit Sac" |
| `PLUMES.PACK_LARGE` | 300 | Pack IAP "Grand Coffre" |

### Service (`src/services/plumes.ts`)

- `getPlumesInfo()` → `DevicePlumesInfo { plumes, lastDailyRewardAt, isPremium }` : info complete en un appel
- `getPlumesCount()` → `number` : solde simple (fallback 30)
- `creditPlumes(amount)` → `number` : crediter des plumes (retourne nouveau solde)
- `claimDailyReward()` → `number | null` : reclamer le bonus quotidien (null = trop tot)
- `setDevicePremium(isPremium)` → `void` : definir le statut premium device-level

### Context (`src/contexts/PlumesContext.tsx`)

Expose via `usePlumes()` :

| Champ | Type | Description |
| :--- | :--- | :--- |
| `plumes` | `number \| null` | Solde courant (`null` = web/loading) |
| `isPremium` | `boolean` | Merge RevenueCat + device-level premium |
| `dailyRewardAvailable` | `boolean` | Bonus quotidien disponible |
| `dailyRewardCountdown` | `string \| null` | "HH:mm" jusqu'au prochain bonus |
| `refresh()` | `Promise<void>` | Recharger les infos plumes |
| `creditAfterAd(amount)` | `Promise<boolean>` | Crediter apres pub (1 retry interne) |
| `claimDaily()` | `Promise<boolean>` | Reclamer le bonus quotidien |

**Timer** : un `setInterval(60_000)` recalcule `dailyRewardAvailable` et `dailyRewardCountdown` toutes les minutes.

### Boutique (`PlumesModal`)

Accessible via tap sur le `PlumeCounter` dans le header. 4 items :
1. 🎬 "Regarder une video" → +30 plumes (`showRewarded` + `creditAfterAd(30)`)
2. 📦 "Petit Sac" → 100 plumes (IAP `mogogo_plumes_100` + `creditPlumes(100)`)
3. 💎 "Grand Coffre" → 300 plumes (IAP `mogogo_plumes_300` + `creditPlumes(300)`)
4. 👑 "Magie Infinie" → Premium (`presentPaywall()`)

### Bonus quotidien (`DailyRewardBanner`)

Affiche sur l'ecran contexte (home/index). Si le bonus est disponible : banniere doree avec bouton "Recuperer +10 plumes". Si non dispo : texte discret avec countdown. Le cooldown est de 24h verifie cote serveur via `last_daily_reward_at`.

### Packs IAP

| Product ID | Plumes | Prix |
| :--- | :--- | :--- |
| `mogogo_plumes_100` | 100 | A definir |
| `mogogo_plumes_300` | 300 | A definir |

L'achat passe par RevenueCat (`Purchases.purchasePackage`), puis le credit est fait via `creditPlumes(amount)` (Supabase RPC). Le stub web retourne `false`.

### Premium

Les utilisateurs premium (RevenueCat **ou** `is_premium` device-level) ne consomment pas de plumes. Le `PlumeCounter` affiche `∞`, la `PlumesModal` est masquee, le pre-check serveur est court-circuite.

## 24. Codes Magiques (Promo Codes)

Systeme de codes promotionnels permettant aux utilisateurs d'obtenir des plumes supplementaires. Le bonus est credite via `credit_plumes` (UPSERT atomique, default 30 + bonus).

### Catalogue

Les codes sont definis cote client dans `src/services/history.ts` (objet `PROMO_CODES: Record<string, number>`) :

| Code | Bonus |
| :--- | :--- |
| `THANKYOU` | 50 plumes |

### Table `promo_redemptions`

```sql
CREATE TABLE public.promo_redemptions (
  device_id text NOT NULL,
  code text NOT NULL,
  redeemed_at timestamptz DEFAULT now() NOT NULL,
  PRIMARY KEY (device_id, code)
);
```

RLS : SELECT pour les utilisateurs authentifies. INSERT/DELETE uniquement via la RPC `SECURITY DEFINER`.

### RPC `redeem_promo_code(p_device_id, p_code, p_bonus)`

Fonction `SECURITY DEFINER` (PL/pgSQL) qui :
1. Verifie le rate limit via `check_redemption_rate_limit()` → retourne `'too_many_attempts'`
2. Verifie si le couple `(device_id, code)` existe deja dans `promo_redemptions` → retourne `'already_redeemed'`
3. Insere dans `promo_redemptions`
4. UPSERT dans `device_plumes` : incremente `plumes_count` de `p_bonus` (default 30 + bonus)
5. Retourne `'ok'`

### Flux

1. L'utilisateur saisit un code dans Parametres → section "Code Magique"
2. Le client normalise (trim + uppercase) et verifie dans le catalogue local `PROMO_CODES`
3. Si le code est inconnu → erreur "invalid_code" (pas d'appel reseau)
4. Si le code existe → appel RPC `redeem_promo_code` (atomique, SECURITY DEFINER)
5. Succes → confettis + message anime (scintillement) + TextInput vide
6. Erreur → message rouge sous le champ

### UX (Settings)

- `TextInput` avec `autoCapitalize="characters"`, `maxLength=20`
- Bouton "Activer" (fond primary, desactive si champ vide ou loading)
- Succes : confettis (`react-native-confetti-cannon`) + texte vert avec animation scintillement (Animated opacity loop)
- Erreurs : texte rouge sous le champ (code invalide, deja utilise, web non supporte, erreur serveur)
