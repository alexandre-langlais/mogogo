# Mogogo

Assistant mobile de recommandation d'activites contextuelles. L'utilisateur trouve son activite via un entonnoir de decisions binaires (boutons A/B) anime par un LLM. La mascotte est Mogogo, un hibou magicien.

## Stack technique

| Couche | Technologie |
|--------|------------|
| Frontend | React Native (Expo SDK 54) + TypeScript + expo-router v6 |
| Backend | Supabase (Auth, PostgreSQL, Edge Functions Deno) |
| IA | LLM via API OpenAI-compatible (configurable : Ollama, Gemini, OpenRouter, Claude) |
| Cartographie | Google Maps (deep link) + Google Places (Nearby Search) |
| Auth | Google OAuth / Apple Sign-In (+ mode dev bypass en `__DEV__`) |
| Achats in-app | RevenueCat (iOS + Android) |
| Publicite | Google AdMob (rewarded video) |
| Stockage session | expo-secure-store (natif) / localStorage (web) |
| i18n | FR, EN, ES (detection automatique) |

## Prerequis

- Node.js >= 18
- npm
- Expo CLI (`npx expo`)
- Supabase CLI (`npx supabase`) + Docker (pour le dev local)
- (Optionnel) Expo Go ou dev client sur mobile
- (Optionnel) Ollama pour un LLM local (`ollama serve`)

## Installation

```bash
# Cloner le repo
git clone <repo-url> && cd mogogo

# Installer les dependances
npm install

# Copier le template de variables d'environnement
cp .env.example .env.local
```

Editer `.env.local` avec les valeurs reelles (voir section suivante).

## Configuration des variables d'environnement

Le fichier `.env.example` documente toutes les variables. Voici les essentielles :

### Supabase (client)

```env
EXPO_PUBLIC_SUPABASE_URL=http://127.0.0.1:54321
EXPO_PUBLIC_SUPABASE_ANON_KEY=<anon-key-from-supabase-start>
```

### Google OAuth (local)

```env
GOOGLE_WEB_CLIENT_ID=your-id.apps.googleusercontent.com
GOOGLE_WEB_CLIENT_SECRET=GOCSPX-...
```

Pour que l'auth Google fonctionne en local :

1. Aller dans **Google Cloud Console > Credentials > OAuth 2.0 Client IDs**
2. Ajouter dans **Authorized redirect URIs** : `http://localhost:54321/auth/v1/callback`
3. Ajouter dans **Authorized JavaScript origins** : `http://localhost:54321`
4. Reporter le Client ID et Secret dans `.env.local`

### LLM

```env
# Ollama local (dev)
LLM_API_URL=http://localhost:11434/v1
LLM_MODEL=llama3:8b
LLM_API_KEY=

# (optionnel) Big model pour la finalisation
# LLM_FINAL_API_URL=https://openrouter.ai/api/v1
# LLM_FINAL_MODEL=anthropic/claude-sonnet-4-5-20250929
# LLM_FINAL_API_KEY=sk-or-...
```

Providers supportes : Ollama, Gemini, OpenRouter, tout endpoint OpenAI-compatible.

### Google Places (serveur)

```env
GOOGLE_PLACES_API_KEY=AIza...
```

Necessaire pour le mode LOCATION_BASED (recherche de lieux a proximite).

### RevenueCat

```env
# Webhook secret (serveur) — voir section "Configuration du webhook RevenueCat"
# REVENUECAT_WEBHOOK_SECRET=your_webhook_secret

# Cles publiques (client)
# EXPO_PUBLIC_REVENUECAT_APPLE_KEY=appl_your_key
# EXPO_PUBLIC_REVENUECAT_GOOGLE_KEY=goog_your_key
```

### AdMob (optionnel)

```env
# EXPO_PUBLIC_ADMOB_ANDROID_APP_ID=ca-app-pub-...
# EXPO_PUBLIC_ADMOB_IOS_APP_ID=ca-app-pub-...
# EXPO_PUBLIC_ADMOB_REWARDED_ANDROID=ca-app-pub-...
# EXPO_PUBLIC_ADMOB_REWARDED_IOS=ca-app-pub-...
```

En l'absence de configuration, des IDs de test Google sont utilises.

## Demarrage local

```bash
# 1. Demarrer Supabase (PostgreSQL + Auth + Edge Functions)
npm run supabase:start

# 2. (dans un autre terminal) Servir les Edge Functions
npm run supabase:functions

# 3. (dans un autre terminal) Lancer l'app Expo
npx expo start
```

En mode dev, un bouton **"Mode dev (sans auth)"** permet de bypasser l'authentification Google.

## Commandes

### Developpement

```bash
npm run supabase:start        # Demarrer Supabase local (injecte .env.local)
npm run supabase:stop         # Arreter Supabase local
npm run supabase:functions    # Servir les Edge Functions (injecte .env.local)
npx expo start                # App Expo (dev)
npm run android               # Lancer sur Android
npm run ios                   # Lancer sur iOS
npm run web                   # Lancer sur Web
npx tsc --noEmit              # Verification TypeScript
```

### Tests

```bash
# Tests unitaires du funnel (tree-logic, theme-engine, drill-down, pool)
npx tsx scripts/test-tree-logic.ts

# Tests unitaires de l'economie de plumes
npx tsx scripts/test-plumes.ts

# Les deux (a lancer apres CHAQUE modification)
npx tsx scripts/test-tree-logic.ts && npx tsx scripts/test-plumes.ts

# Tests integration avec vrai LLM (necessite .env.cli)
npx tsx scripts/test-tree-logic.ts --integration
```

### CLI de test (sessions sans app mobile)

```bash
# Mode batch (choix predetermines)
npx tsx scripts/cli-session.ts --batch --context '{"social":"friends","environment":"env_open_air"}' --choices "A,B,A"

# Mode interactif
npx tsx scripts/cli-session.ts --context '{"social":"solo","environment":"env_home"}'

# Mode auto (un second LLM joue l'utilisateur)
npx tsx scripts/cli-session.ts --auto --persona "Je veux jouer a un jeu video" --context '{"social":"solo","environment":"env_home"}'
```

### Benchmark de modeles LLM

```bash
npx tsx scripts/benchmark-models.ts gpt-oss:120b-cloud ministral-3:14b-cloud
npx tsx scripts/benchmark-models.ts --rounds 3 model1 model2
```

### Deploiement

```bash
# Preview : DB + secrets + Edge Functions
bash deployment/update-supabase-preview.sh

# Production : idem
bash deployment/update-supabase-prod.sh

# Push la config Supabase (auth providers, etc.)
bash deployment/config.preview.sh
bash deployment/config.prod.sh
```

### Build Expo (EAS)

```bash
eas build --profile preview --platform android     # Build preview
eas build --profile production --platform android   # Build production
eas submit --platform android                       # Soumettre sur Google Play
eas update --branch preview --message "..."         # OTA update (sans rebuild)
```

## Configuration du webhook RevenueCat

Le quota anti-churning repose sur un webhook RevenueCat (modele push) qui alimente une table de mapping `app_user_id` → `original_app_user_id` en base.

### 1. Generer un secret partage

```bash
openssl rand -hex 32
```

### 2. Configurer le secret cote Supabase

Ajouter `REVENUECAT_WEBHOOK_SECRET=<le-secret>` dans :
- `.env.local` (dev local)
- `deployment/.env.preview` (preview)
- `deployment/.env.prod` (production)

Puis deployer les secrets :

```bash
# Preview
supabase secrets set --env-file deployment/.env.preview --project-ref <preview-ref>

# Production
supabase secrets set --env-file deployment/.env.prod --project-ref <prod-ref>
```

### 3. Configurer le webhook cote RevenueCat

1. Aller dans **RevenueCat Dashboard > Project Settings > Webhooks**
2. Creer un nouveau webhook :
   - **URL** : `https://<projet>.supabase.co/functions/v1/revenuecat-webhook`
   - **Authorization header** : `Bearer <le-secret>`
3. Activer les events : `INITIAL_PURCHASE`, `RENEWAL`, `PRODUCT_CHANGE`, `CANCELLATION`, `EXPIRATION`, `SUBSCRIBER_ALIAS`

### 4. Tester en local

```bash
curl -X POST http://localhost:54321/functions/v1/revenuecat-webhook \
  -H "Authorization: Bearer <le-secret>" \
  -H "Content-Type: application/json" \
  -d '{"event":{"type":"INITIAL_PURCHASE","app_user_id":"test-uid","original_app_user_id":"$RCAnonymousID:abc"}}'
```

Verifier la ligne dans la table `revenuecat_user_mapping` via Supabase Studio (`http://localhost:54323`).

## Environnements

| Environnement | Supabase | Fichier env | Commandes |
|---------------|----------|-------------|-----------|
| **Local** | `supabase start` (localhost:54321) | `.env.local` | `npm run supabase:start` + `npx expo start` |
| **Preview** | `onikkjpvrralafalzsdk.supabase.co` | `deployment/.env.preview` | `bash deployment/update-supabase-preview.sh` |
| **Production** | `oihgbdkzfnwzbqzxnjwb.supabase.co` | `deployment/.env.prod` | `bash deployment/update-supabase-prod.sh` |

Les variables Expo pour preview/prod sont gerees via **EAS Secrets** (`deployment/create_supabase_secrets_expo.sh`), pas via les fichiers `.env.*`.

## Structure du projet

```
app/                              # Expo Router — pages et navigation
├── _layout.tsx                   # Root layout + AuthGuard
├── index.tsx                     # Ecran d'accueil
├── (auth)/
│   ├── _layout.tsx
│   └── login.tsx                 # Login Google/Apple + mode dev
└── (main)/
    ├── _layout.tsx               # PlumesProvider + FunnelProvider + Tabs
    ├── home/
    │   ├── _layout.tsx           # Stack (home → funnel → result)
    │   ├── index.tsx             # Saisie contexte + geolocalisation
    │   ├── funnel.tsx            # Entonnoir A/B (coeur de l'app)
    │   └── result.tsx            # Resultat final + actions
    ├── grimoire.tsx              # Grimoire (preferences thematiques)
    ├── training.tsx              # Training (swipe de cartes)
    ├── history/
    │   ├── _layout.tsx
    │   ├── index.tsx             # Liste historique
    │   └── [id].tsx              # Detail session
    └── settings.tsx              # Reglages + codes promo + suppression compte

src/
├── components/                   # Composants UI reutilisables
├── constants/                    # COLORS, tags, trainingDeck
├── contexts/
│   ├── FunnelContext.tsx          # State management central (useReducer)
│   ├── PlumesContext.tsx          # Economie de plumes (monnaie virtuelle)
│   └── ThemeContext.tsx           # Contexte theme UI
├── hooks/                        # useAuth, useLocation, useProfile, useHistory, etc.
├── i18n/                         # Internationalisation (fr, en, es)
├── services/                     # supabase, llm, places, plumes, purchases, admob, etc.
├── types/                        # LLMResponse, UserContext, Profile, FunnelChoice
└── utils/                        # actionIcons, mascotVariant

scripts/
├── cli-session.ts                # CLI de test (batch, interactif, auto)
├── benchmark-models.ts           # Benchmark vitesse + coherence JSON
├── test-tree-logic.ts            # Tests unitaires funnel (~146 assertions)
├── test-plumes.ts                # Tests unitaires plumes (~105 assertions)
├── test-outhome-logic.ts         # Tests out-home
├── test-quota.ts                 # Tests quota anti-churning
├── compose-destiny-parchment.ts  # Generation d'images de partage
└── lib/                          # Moteurs de test (plumes-engine, pool-logic, etc.)

deployment/
├── update-supabase-preview.sh    # Deploy complet (preview)
├── update-supabase-prod.sh       # Deploy complet (production)
├── config.preview.sh             # Push config Supabase (preview)
├── config.prod.sh                # Push config Supabase (production)
└── create_supabase_secrets_expo.sh

supabase/
├── migrations/                   # 001 → 017 (profiles, plumes, quotas, etc.)
└── functions/
    ├── llm-gateway/              # Edge Function principale (funnel, places, LLM)
    ├── delete-account/           # Suppression de compte
    ├── revenuecat-webhook/       # Webhook RevenueCat (mapping anti-churning)
    └── _shared/                  # Modules partages (theme-engine, drill-down, etc.)
```

## Architecture

### Flux principal

```
Accueil → Login → Contexte → [Places Scan] → Funnel A/B → Resultat → Actions
```

1. **Accueil** — Splash avec mascotte, bouton "Commencer"
2. **Login** — Google OAuth / Apple Sign-In via Supabase
3. **Contexte** — Selection : social, environnement, localisation GPS, indice textuel optionnel
4. **Places Scan** (out-home) — Scan Google Places a proximite, retourne les activites disponibles
5. **Funnel** — Le LLM propose des choix binaires A/B. "Aucune des deux" declenche un pivot. 3 pivots → breakout (Top 3)
6. **Resultat** — Recommandation finale avec boutons d'action (Maps, Steam, YouTube, Spotify, etc.)

### Edge Functions

| Fonction | Role | Auth |
|----------|------|------|
| `llm-gateway` | Funnel complet : theme duel, places scan, outdoor pool, drill-down, reroll | JWT Supabase |
| `delete-account` | Suppression de compte | JWT Supabase |
| `revenuecat-webhook` | Webhook RevenueCat → mapping anti-churning | Secret partage (`REVENUECAT_WEBHOOK_SECRET`) |

### Communication client-serveur

```
App mobile → supabase.functions.invoke("llm-gateway") → Edge Function → API LLM / Google Places
```

Le client n'a jamais acces aux cles API. L'Edge Function verifie le JWT, charge le profil, orchestre les appels, et retourne la reponse JSON.

### Economie de plumes

Les plumes sont la monnaie virtuelle de l'app (gate freemium) :
- **30 plumes** a l'inscription
- **10 plumes** consommees par session (au finalize)
- **+10** par bonus quotidien (toutes les 24h)
- **+30** par video rewardee (AdMob)
- **+100/+300** par achat in-app (RevenueCat)
- **Premium** : plumes infinies

## Notes techniques

- `tsconfig.json` exclut `supabase/functions/**` (runtime Deno, pas Node)
- Alias path `@/*` → `src/*` dans tsconfig
- Scheme URL `mogogo://` dans `app.config.ts` pour le deep link OAuth
- expo-secure-store sur natif, localStorage sur web (fallback dans `supabase.ts`)
- Toutes les couleurs centralisees dans `COLORS` de `@/constants`
- L'Edge Function utilise `response_format: { type: "json_object" }` pour forcer le JSON du LLM
- Les specs completes sont dans `specs.md`
