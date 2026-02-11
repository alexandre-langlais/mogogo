# Roadmap Mogogo : Amélioration de la Pertinence & Feedback Utilisateur

Ce document présente les évolutions prioritaires pour transformer l'insatisfaction utilisateur en levier de personnalisation.

---

## 🟢 Phase 1 : Feedback Direct & Réactivité (Quick Wins)

### US 1.1 : Le Veto de Mogogo (Feedback Négatif)
**En tant qu'utilisateur**, si une suggestion ne me plaît absolument pas, **je veux** pouvoir cliquer sur un bouton "Pas pour moi" **afin que** Mogogo ne me propose plus d'activités similaires durant cette session.
- **Critères d'acceptation :**
    - Ajout d'une icône "Pouce vers le bas" sur les cartes de résultats.
    - Le clic sur ce bouton envoie un signal au `llm-gateway` pour exclure ce tag spécifique de l'affinage immédiat.
    - Baisse de 5 points du score du tag associé dans la table `profiles.preferences` (le Grimoire).

### US 1.2 : Transparence de la Vision (Explainability)
**En tant qu'utilisateur**, **je veux** comprendre pourquoi une activité m'est proposée **afin de** valider que Mogogo a bien compris mon contexte.
- **Critères d'acceptation :**
    - Affichage d'une micro-phrase sous le titre de l'activité (ex: *"Parfait pour ton énergie niveau 4 !"* ou *"Basé sur ton amour pour la Culture"*).
    - Utilisation des métadonnées du LLM pour générer cette justification.

---

## 🟡 Phase 2 : Le Mode Entraînement (Engagement Actif)

### US 2.1 : Rituel de Méditation du Hibou (Mode Entraînement)

**En tant qu'utilisateur**, je veux effectuer un calibrage rapide de mes goûts via une interface de swipe, **afin que** Mogogo comprenne immédiatement mes préférences sans latence technique.

- **Fonctionnement Technique :**
  - **SANS APPEL LLM** : Les cartes affichées proviennent d'un pool statique local (`TRAINING_DECK`) défini dans le code.
  - **Données de référence** : Chaque carte statique possède des tags prédéfinis (ex: "Aller voir un concert" -> tags: `musique, fete, budget_standard`).
  - **Mise à jour silencieuse** : Chaque swipe déclenche un appel à `grimoire.boostTags()` ou `grimoire.penalizeTags()` en arrière-plan.
  - **Onboarding (First Run)** :
    - Si `is_first_launch`, afficher une Modal de proposition.
    - Si refus : Message pédagogique : *"Pas de souci ! Retrouve l'entraînement dans tes Paramètres ⚙️ quand tu voudras affiner mes visions."*

- **Critères d'acceptation :**
  - Transition entre les cartes < 100ms (zéro attente réseau).
  - Les scores du Grimoire en base de données sont mis à jour à chaque swipe (ou en lot à la fin).
  - Le pool de 15 cartes couvre 100% des tags principaux définis dans les specs.

### US 2.2 : Édition du Grimoire (Contrôle Manuel)
**En tant qu'utilisateur**, **je veux** voir mes propres affinités calculées par l'app **afin de** corriger manuellement mes goûts.
- **Critères d'acceptation :**
    - Page "Mon Grimoire" affichant les 5 tags dominants sous forme de jauges (ex: Nature 85%, Sport 12%).
    - Possibilité pour l'utilisateur de déplacer le curseur manuellement pour ajuster ses préférences.

---

## 🔵 Phase 3 : Personnalisation Avancée (Finesse)

### US 3.1 : La Blacklist Magique (Veto-Tags permanents)
**En tant qu'utilisateur**, **je veux** bannir définitivement certains types d'activités (ex: "Boîtes de nuit") **afin de** ne jamais voir ces suggestions, peu importe mon contexte.
- **Critères d'acceptation :**
    - Section "Interdits" dans le profil.
    - Les tags sélectionnés sont injectés dans le `system-prompt` en tant que contraintes d'exclusion strictes.

### US 3.2 : Curiosité du Hibou (Slider d'Exploration)
**En tant qu'utilisateur**, **je veux** pouvoir choisir si je veux des suggestions "Sûres" ou "Surprenantes" **afin de** sortir de ma zone de confort quand je le décide.
- **Critères d'acceptation :**
    - Ajout d'un slider "Niveau de Curiosité" (1 à 5).
    - À 1 : Le LLM suit strictement le Grimoire.
    - À 5 : Le LLM introduit 50% de suggestions avec des tags à faible score pour favoriser la découverte.

---

## 🔴 Phase 4 : Analytique & Optimisation (PO Insight)

### US 4.1 : Dashboard de Performance (Admin)
**En tant que PO**, **je veux** suivre le ratio de clics par "Angle de Question 1" **afin d'** éliminer les questions qui ne génèrent pas d'intérêt.
- **Critères d'acceptation :**
    - Enregistrement de l'`angle_id` de la Q1 dans les logs de session.
    - Visualisation du tunnel de conversion par angle de départ.