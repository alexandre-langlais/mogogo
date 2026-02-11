# Mogogo

Assistant mobile de recommandation d'activites contextuelles. L'utilisateur trouve son activite via un entonnoir de decisions binaires (boutons A/B) anime par un LLM. La mascotte est Mogogo, un hibou magicien.

## Stack technique

| Couche | Technologie |
|--------|------------|
| Frontend | React Native (Expo SDK 54) + TypeScript + expo-router v6 |
| Backend | Supabase (Auth, PostgreSQL, Edge Functions Deno) |
| IA | LLM via API OpenAI-compatible (configurable : Ollama, Claude, etc.) |
| Cartographie | Google Maps (ouverture via deep link pour le MVP) |
| Auth | Google OAuth / Apple Sign-In (+ mode dev sans auth) |
| Stockage session | expo-secure-store (natif) / localStorage (web) |

## Environnements

| Environnement | Supabase | Canal Google Play | Commandes |
|---------------|----------|-------------------|-----------|
| **Local** | `supabase start` (localhost:54321) | — | `npm run supabase:start` + `npx expo start` |
| **Preview** | `onikkjpvrralafalzsdk.supabase.co` | Tests ouverts | `bash deployment/update-supabase-preview.sh` |
| **Production** | `oihgbdkzfnwzbqzxnjwb.supabase.co` | Production | `bash deployment/update-supabase-prod.sh` |

Les variables d'environnement :
- **Local** : `.env.local` (client Expo + Google OAuth + LLM)
- **Preview/Prod** : `deployment/.env.preview` / `deployment/.env.prod` (secrets Supabase uniquement). Les vars Expo sont gerees via EAS Secrets (`deployment/create_supabase_secrets_expo.sh`).

## Prerequis

- Node.js >= 18
- npm ou yarn
- Expo CLI (`npx expo`)
- Supabase CLI (`npx supabase`) + Docker (pour le dev local)
- Un projet Supabase avec :
  - Google OAuth configure dans Authentication > Providers
  - La migration SQL appliquee (voir `supabase/migrations/`)
  - L'Edge Function `llm-gateway` deployee
- (Optionnel) Expo Go sur mobile pour le dev

## Installation

```bash
# Cloner le repo
git clone <repo-url> && cd mogogo

# Installer les dependances
npm install

# Configurer les variables d'environnement
cp .env.example .env.local
```

### Variables d'environnement

Creer un fichier `.env.local` a la racine (voir `.env.example` pour le template) :

```env
# Google OAuth (local)
GOOGLE_WEB_CLIENT_ID=your-id.apps.googleusercontent.com
GOOGLE_WEB_CLIENT_SECRET=GOCSPX-...

# Supabase (client-side)
EXPO_PUBLIC_SUPABASE_URL=http://127.0.0.1:54321
EXPO_PUBLIC_SUPABASE_ANON_KEY=your-local-anon-key

# LLM (server-side)
LLM_API_URL=http://localhost:11434/v1
LLM_MODEL=llama3:8b
LLM_API_KEY=
```

### OAuth Google (local)

Pour que l'authentification Google fonctionne en local :

1. Aller dans **Google Cloud Console > Credentials > OAuth 2.0 Client IDs**
2. Ajouter dans **Authorized redirect URIs** : `http://localhost:54321/auth/v1/callback`
3. Ajouter dans **Authorized JavaScript origins** : `http://localhost:54321`
4. Reporter le Client ID et Secret dans `.env.local`

## Commandes de developpement

```bash
# Demarrer Supabase local (injecte .env.local pour Google OAuth)
npm run supabase:start

# Arreter Supabase local
npm run supabase:stop

# Servir les Edge Functions en local (injecte .env.local pour les vars LLM)
npm run supabase:functions

# Lancer l'app en mode dev (Expo Go / navigateur)
npx expo start

# Lancer directement sur une plateforme
npm run android
npm run ios
npm run web

# Verifier les types TypeScript
npx tsc --noEmit

# Generer un parchemin du destin (image de partage 1080x1080)
npx tsx scripts/compose-destiny-parchment.ts \
  --title "Aller au Cinéma" \
  --variant cinema \
  --energy 3 \
  --budget "Éco"
```

### Build et deploiement Expo (EAS)

```bash
# Build preview (distribution interne, dev client)
eas build --profile preview --platform android

# Build production
eas build --profile production --platform android

# Soumettre sur Google Play
eas submit --platform android

# Mettre a jour en OTA (sans rebuild)
eas update --branch preview --message "description du changement"
eas update --branch production --message "description du changement"

# En local
# Pour un AAB (preview / soumission)
eas build --platform android --profile preview --local

# Pour un AAB (production / soumission)
eas build --platform android --profile production --local

export EAS_RELEASE_NOTES=$(git log -10 --pretty=format:'- %s') && eas submit --platform android --profile preview --path ./build-1770730738224.apk
```

### Scripts de deployment Supabase (preview / production)

```bash
# Preview : push config + DB + secrets + Edge Functions
bash deployment/update-supabase-preview.sh

# Production : idem
bash deployment/update-supabase-prod.sh

# Push la config Supabase (auth providers, etc.)
bash deployment/config.preview.sh
bash deployment/config.prod.sh
```

## Structure du projet

```
app/                          # Expo Router — pages et navigation
├── _layout.tsx               # Root layout + AuthGuard (redirection auto)
├── index.tsx                 # Ecran d'accueil
├── (auth)/
│   ├── _layout.tsx           # Layout auth (sans header)
│   └── login.tsx             # Login Google/Apple + mode dev
└── (main)/
    ├── _layout.tsx           # Layout principal + FunnelProvider
    ├── context.tsx           # Saisie du contexte utilisateur
    ├── funnel.tsx            # Entonnoir A/B (coeur de l'app)
    └── result.tsx            # Resultat final + lien Maps

src/
├── components/
│   ├── ChoiceButton.tsx      # Bouton A/B (variantes primary/secondary)
│   ├── MogogoMascot.tsx      # Bulle mascotte avec emoji hibou
│   └── LoadingMogogo.tsx     # Spinner avec message Mogogo
├── contexts/
│   └── FunnelContext.tsx     # State management central (useReducer)
├── hooks/
│   ├── useAuth.ts            # Auth Supabase + session reactive
│   └── useLocation.ts       # Geolocalisation (expo-location)
├── services/
│   ├── supabase.ts           # Client Supabase + SecureStore adapter
│   ├── llm.ts                # Appel Edge Function + validation + retry
│   └── places.ts             # Ouverture Google Maps via deep link
├── types/
│   └── index.ts              # LLMResponse, UserContext, Profile, FunnelChoice
└── constants/
    └── index.ts              # COLORS, SEARCH_RADIUS, PLACES_MIN_RATING

deployment/
├── config.preview.sh             # Push config Supabase (preview)
├── config.prod.sh                # Push config Supabase (production)
├── update-supabase-preview.sh    # Deploy complet (preview)
├── update-supabase-prod.sh       # Deploy complet (production)
└── create_supabase_secrets_expo.sh # Creer les EAS Secrets

supabase/
├── migrations/
│   └── 001_create_profiles.sql   # Table profiles + RLS + trigger auto
└── functions/
    └── llm-gateway/
        └── index.ts              # Edge Function : auth + quotas + appel LLM
```

## Architecture

### Flux principal

```
Accueil → Login → Contexte → Funnel A/B → Resultat → Google Maps
```

1. **Accueil** (`index.tsx`) — Splash avec mascotte, bouton "Commencer"
2. **Login** (`login.tsx`) — Google OAuth via Supabase. En `__DEV__`, un bouton "Mode dev" permet de bypasser l'auth
3. **Contexte** (`context.tsx`) — L'utilisateur selectionne : social, energie, budget, environnement. La geolocalisation est demandee automatiquement
4. **Funnel** (`funnel.tsx`) — Le LLM propose des choix binaires A/B. L'utilisateur peut aussi choisir "Peu importe" ou "Aucune des deux" (pivot). Apres 3 pivots : breakout (Top 3)
5. **Resultat** (`result.tsx`) — Affiche la recommandation finale avec un bouton "Voir sur Maps"

### Navigation gardee

Le composant `AuthGuard` dans `app/_layout.tsx` gere la redirection automatique :
- Pas de session + acces a `/(main)/*` → redirige vers `/(auth)/login`
- Session active + acces a `/(auth)/*` → redirige vers `/(main)/context`

### State management — FunnelContext

Le coeur de l'app est le `FunnelContext` (`src/contexts/FunnelContext.tsx`), un `useReducer` qui gere :

| Champ | Type | Description |
|-------|------|-------------|
| `context` | `UserContext` | Contexte utilisateur (social, energie, budget, etc.) |
| `history` | `FunnelHistoryEntry[]` | Pile des reponses precedentes (pour backtracking) |
| `currentResponse` | `LLMResponse` | Reponse LLM en cours d'affichage |
| `loading` | `boolean` | Appel LLM en cours |
| `error` | `string` | Message d'erreur |
| `pivotCount` | `number` | Nombre de pivots consecutifs |

Actions disponibles via le hook `useFunnel()` :

- **`setContext(ctx)`** — Definit le contexte utilisateur
- **`makeChoice(choice?)`** — Appelle le LLM avec le choix (`"A"`, `"B"`, `"neither"`, `"any"`, ou `undefined` pour le premier appel)
- **`goBack()`** — Depile l'historique pour revenir a la question precedente (sans rappeler le LLM)
- **`reset()`** — Reinitialise tout l'etat

### Communication avec le LLM

```
App mobile → supabase.functions.invoke("llm-gateway") → Edge Function → API LLM
```

Le client n'a jamais acces aux cles API. L'Edge Function `llm-gateway` :
1. Verifie le JWT Supabase
2. Lit le profil utilisateur et verifie le quota mensuel
3. Reset automatique du compteur en debut de mois
4. Construit les messages (system prompt + contexte + historique + choix)
5. Appelle l'API LLM (format OpenAI-compatible)
6. Retourne la reponse JSON

### Contrat JSON du LLM

```json
{
  "statut": "en_cours | finalise",
  "phase": "questionnement | pivot | breakout | resultat",
  "mogogo_message": "Phrase sympathique du hibou",
  "question": "Question courte (max 80 chars)",
  "options": { "A": "Label A", "B": "Label B" },
  "recommandation_finale": {
    "titre": "Nom de l'activite",
    "explication": "Pourquoi Mogogo a choisi cela",
    "google_maps_query": "Requete optimisee pour Maps"
  },
  "metadata": { "pivot_count": 0, "current_branch": "Urbain/Culture" }
}
```

### Robustesse du client LLM

Le service `src/services/llm.ts` inclut :

- **Validation stricte** : `validateLLMResponse()` verifie la structure JSON (statut, phase, mogogo_message, question/recommandation_finale selon le statut)
- **Timeout** : 30 secondes par requete via `AbortController`
- **Retry automatique** : 1 retry apres 1s pour les erreurs reseau (502, timeout)
- **Gestion quota** : erreur 429 detectee et affichee avec un message Mogogo specifique

### Quotas

| Plan | Limite mensuelle |
|------|-----------------|
| Gratuit | 500 requetes/mois |
| Premium | 5000 requetes/mois |

Le controle est effectue cote serveur dans l'Edge Function. Reset automatique le 1er du mois.

## Tester le flux complet

### Mode dev (sans Supabase)

1. Lancer `npx expo start`
2. Sur l'ecran de login, cliquer **"Mode dev (sans auth)"**
3. Cela redirige directement vers l'ecran de contexte

> Note : sans Supabase configure, l'appel LLM echouera. Le message d'erreur s'affichera avec un bouton "Reessayer".

### Avec Supabase

1. Configurer les variables d'environnement (`.env.local` + secrets Supabase)
2. Appliquer la migration : `supabase db push`
3. Deployer l'Edge Function : `supabase functions deploy llm-gateway`
4. Lancer `npx expo start`
5. Se connecter via Google OAuth
6. Parcourir le flux : Contexte → Funnel → Resultat → Maps

### Points de verification

- **Auth gardee** : acceder a `/(main)/context` sans session → doit rediriger vers login
- **Backtracking** : dans le funnel, faire des choix puis cliquer "Revenir" → l'etat precedent est restaure sans rappel LLM
- **Pivot/Breakout** : cliquer 3x "Aucune des deux" → le LLM passe en breakout
- **Erreurs reseau** : couper le reseau → message d'erreur + bouton "Reessayer"
- **Quota depasse** : message Mogogo specifique sans bouton "Reessayer"

## Requetes SQL de consultation (token tracking)

```sql
-- Appels individuels (derniers 10)
SELECT session_id, choice, prompt_tokens, completion_tokens, is_prefetch
FROM llm_calls ORDER BY created_at DESC LIMIT 10;

-- Tokens par session
SELECT session_id, COUNT(*) as calls, SUM(prompt_tokens) as input, SUM(completion_tokens) as output
FROM llm_calls GROUP BY session_id ORDER BY MIN(created_at) DESC;

-- Liaison avec sessions validees
SELECT sh.activity_title, lc.total_prompt, lc.total_completion
FROM sessions_history sh
JOIN (SELECT session_id, SUM(prompt_tokens) total_prompt, SUM(completion_tokens) total_completion FROM llm_calls GROUP BY session_id) lc
ON sh.session_id = lc.session_id;

-- Sessions d'un utilisateur avec cout en tokens
SELECT lc.session_id, sh.activity_title, COUNT(*) as calls,
       SUM(lc.prompt_tokens) as prompt_total, SUM(lc.completion_tokens) as completion_total,
       SUM(lc.total_tokens) as tokens_total, MIN(lc.created_at) as started_at
FROM llm_calls lc
LEFT JOIN sessions_history sh ON sh.session_id = lc.session_id
WHERE lc.user_id = '<user_id>'
GROUP BY lc.session_id, sh.activity_title
ORDER BY started_at DESC;

-- Total de tokens sur une periode
SELECT COUNT(*) as calls, SUM(prompt_tokens) as prompt_total,
       SUM(completion_tokens) as completion_total, SUM(total_tokens) as tokens_total
FROM llm_calls
WHERE created_at >= '2025-01-01' AND created_at < '2025-02-01';
```

## Notes techniques

- `tsconfig.json` exclut `supabase/functions/**` (runtime Deno, pas Node)
- Alias path `@/*` → `src/*` configure dans tsconfig
- Le scheme URL `mogogo://` est configure dans `app.config.ts` pour le deep link OAuth
- expo-secure-store est utilise sur natif, localStorage sur web (fallback dans `supabase.ts`)
- L'Edge Function utilise `response_format: { type: "json_object" }` pour forcer le JSON du LLM
