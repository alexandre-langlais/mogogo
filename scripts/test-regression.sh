#!/bin/bash
# Test de non-régression Mogogo — Lance des sessions CLI variées et vérifie les résultats
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
PROJECT_DIR="$(dirname "$SCRIPT_DIR")"
RESULTS_DIR="$PROJECT_DIR/test-results"
TIMESTAMP=$(date +%Y%m%d_%H%M%S)
RUN_DIR="$RESULTS_DIR/run_$TIMESTAMP"
mkdir -p "$RUN_DIR"

PASS=0
FAIL=0
ERRORS=""

run_test() {
  local test_id="$1"
  local description="$2"
  shift 2
  local transcript="$RUN_DIR/${test_id}.json"

  echo -n "[$test_id] $description ... "

  if timeout 120 npx tsx "$SCRIPT_DIR/cli-session.ts" "$@" --json --transcript "$transcript" --max-steps 15 > /dev/null 2>"$RUN_DIR/${test_id}.log"; then
    # Vérifier que le transcript existe et contient finalResponse
    if [ -f "$transcript" ]; then
      local has_final
      has_final=$(node -e "
        const d = require('$transcript');
        const ok = d.finalResponse && d.finalResponse.statut === 'finalisé' && d.finalResponse.recommandation_finale;
        const rec = d.finalResponse?.recommandation_finale;
        const checks = [];
        if (!ok) checks.push('NO_FINAL');
        if (rec && !rec.titre) checks.push('NO_TITRE');
        if (rec && (!rec.actions || rec.actions.length === 0)) checks.push('NO_ACTIONS');
        if (rec && rec.actions) {
          for (const a of rec.actions) {
            if (!a.type || !a.label || !a.query) checks.push('BAD_ACTION');
          }
        }
        // Vérifier que tous les steps ont un JSON valide
        for (const s of d.steps) {
          if (!s.response || !s.response.statut) checks.push('BAD_STEP_' + s.step);
        }
        if (checks.length === 0) {
          console.log('PASS|' + d.steps.length + ' steps|' + d.totalDurationMs + 'ms|' + (rec?.titre ?? 'N/A'));
        } else {
          console.log('FAIL|' + checks.join(',') + '|' + d.steps.length + ' steps|' + (rec?.titre ?? 'N/A'));
        }
      " 2>/dev/null)

      local status="${has_final%%|*}"
      if [ "$status" = "PASS" ]; then
        echo "✅ $has_final"
        PASS=$((PASS + 1))
      else
        echo "❌ $has_final"
        FAIL=$((FAIL + 1))
        ERRORS="$ERRORS\n[$test_id] $description: $has_final"
      fi
    else
      echo "❌ Pas de transcript"
      FAIL=$((FAIL + 1))
      ERRORS="$ERRORS\n[$test_id] $description: No transcript file"
    fi
  else
    echo "❌ Crash/timeout"
    FAIL=$((FAIL + 1))
    ERRORS="$ERRORS\n[$test_id] $description: Process crashed or timed out"
    # Sauvegarder le log d'erreur
    if [ -f "$RUN_DIR/${test_id}.log" ]; then
      tail -5 "$RUN_DIR/${test_id}.log" >> "$RUN_DIR/${test_id}.error"
    fi
  fi
}

echo "============================================"
echo "🦉 Mogogo — Test de non-régression"
echo "   $(date)"
echo "   Résultats: $RUN_DIR"
echo "============================================"
echo ""

# =============================================
# LOT 1 : Contextes sociaux de base (5 tests)
# =============================================
echo "--- LOT 1 : Contextes sociaux ---"

run_test "01_solo_standard" "Seul, énergie moyenne, standard, intérieur" \
  --auto --persona "Je veux me détendre ce soir" \
  --social solo --energy 3 --budget standard --env indoor

run_test "02_friends_outdoor" "Amis, haute énergie, standard, extérieur" \
  --auto --persona "On veut faire un truc fun entre potes dehors" \
  --social friends --energy 5 --budget standard --env outdoor

run_test "03_couple_luxury" "Couple, énergie moyenne, luxe, intérieur" \
  --auto --persona "Soirée romantique en amoureux" \
  --social couple --energy 3 --budget luxury --env indoor

run_test "04_family_free" "Famille, énergie haute, gratuit, extérieur" \
  --auto --persona "Journée en famille sans dépenser" \
  --social family --energy 4 --budget free --env outdoor

run_test "05_solo_budget" "Seul, faible énergie, économique, intérieur" \
  --auto --persona "Je suis crevé et je veux un truc pas cher" \
  --social solo --energy 1 --budget budget --env indoor

# =============================================
# LOT 2 : Enfants — tranches d'âge (8 tests)
# =============================================
echo ""
echo "--- LOT 2 : Famille avec enfants ---"

run_test "06_kids_toddler" "Famille, tout-petits 1-3 ans" \
  --auto --persona "Activité avec mon bébé de 2 ans" \
  --social family --energy 3 --budget standard --env indoor --children-ages "1,3"

run_test "07_kids_preschool" "Famille, maternelle 3-6 ans, extérieur" \
  --auto --persona "Sortie au parc avec mes enfants" \
  --social family --energy 4 --budget free --env outdoor --children-ages "3,6"

run_test "08_kids_school" "Famille, primaire 6-10 ans" \
  --auto --persona "Activité éducative et amusante" \
  --social family --energy 4 --budget standard --env any_env --children-ages "6,10"

run_test "09_kids_preteen" "Famille, préados 10-13 ans" \
  --auto --persona "Trouver un truc cool pour mes ados" \
  --social family --energy 4 --budget standard --env indoor --children-ages "10,13"

run_test "10_kids_teen" "Famille, ados 13-17 ans, budget" \
  --auto --persona "Activité fun avec des ados" \
  --social family --energy 5 --budget budget --env outdoor --children-ages "13,17"

run_test "11_kids_wide_range" "Famille, large range 2-12 ans" \
  --auto --persona "Sortie familiale avec enfants d'âges variés" \
  --social family --energy 3 --budget standard --env any_env --children-ages "2,12"

run_test "12_kids_baby" "Famille, bébé 0-1 an" \
  --auto --persona "Que faire avec un nourrisson" \
  --social family --energy 2 --budget free --env indoor --children-ages "0,1"

run_test "13_kids_luxury" "Famille, enfants 5-8, luxe" \
  --auto --persona "Activité premium pour les enfants" \
  --social family --energy 4 --budget luxury --env indoor --children-ages "5,8"

# =============================================
# LOT 3 : Timing / saisons (7 tests)
# =============================================
echo ""
echo "--- LOT 3 : Timing et saisons ---"

run_test "14_timing_now" "Maintenant, amis, extérieur" \
  --auto --persona "On veut sortir tout de suite" \
  --social friends --energy 4 --budget standard --env outdoor --timing now

run_test "15_timing_summer" "Été prochain (juillet), couple" \
  --auto --persona "Activité estivale en amoureux" \
  --social couple --energy 4 --budget standard --env outdoor --timing "2026-07-15"

run_test "16_timing_winter" "Hiver (décembre), famille" \
  --auto --persona "Activité d'hiver en famille" \
  --social family --energy 3 --budget standard --env any_env --timing "2026-12-20"

run_test "17_timing_spring" "Printemps (avril), seul" \
  --auto --persona "Profiter du printemps seul" \
  --social solo --energy 4 --budget budget --env outdoor --timing "2026-04-10"

run_test "18_timing_autumn" "Automne (octobre), amis" \
  --auto --persona "Sortie automnale entre potes" \
  --social friends --energy 3 --budget standard --env outdoor --timing "2026-10-18"

run_test "19_timing_weekend" "Weekend, couple, luxe" \
  --auto --persona "Weekend romantique de luxe" \
  --social couple --energy 3 --budget luxury --env any_env --timing "2026-03-14"

run_test "20_timing_kids_summer" "Été avec enfants 4-8" \
  --auto --persona "Vacances d'été avec les enfants" \
  --social family --energy 5 --budget standard --env outdoor --timing "2026-08-05" --children-ages "4,8"

# =============================================
# LOT 4 : Langues (6 tests)
# =============================================
echo ""
echo "--- LOT 4 : Langues ---"

run_test "21_lang_en_solo" "Anglais, seul, intérieur" \
  --auto --persona "I want to relax at home tonight" \
  --social solo --energy 2 --budget standard --env indoor --lang en

run_test "22_lang_en_friends" "Anglais, amis, extérieur" \
  --auto --persona "Looking for outdoor fun with friends" \
  --social friends --energy 5 --budget standard --env outdoor --lang en

run_test "23_lang_es_couple" "Espagnol, couple, luxe" \
  --auto --persona "Quiero una velada romántica" \
  --social couple --energy 3 --budget luxury --env indoor --lang es

run_test "24_lang_es_family" "Espagnol, famille, enfants" \
  --auto --persona "Actividad con niños" \
  --social family --energy 4 --budget standard --env outdoor --lang es --children-ages "5,10"

run_test "25_lang_en_timing" "Anglais, timing hiver" \
  --auto --persona "Winter activity for the family" \
  --social family --energy 3 --budget standard --env indoor --lang en --timing "2026-12-25"

run_test "26_lang_fr_reference" "Français référence (contrôle)" \
  --auto --persona "Chercher une activité sympa entre amis" \
  --social friends --energy 4 --budget standard --env any_env

# =============================================
# LOT 5 : Cas limites énergie/budget (6 tests)
# =============================================
echo ""
echo "--- LOT 5 : Cas limites ---"

run_test "27_energy_min" "Énergie 1, seul, gratuit" \
  --auto --persona "Je suis épuisé, zéro motivation" \
  --social solo --energy 1 --budget free --env indoor

run_test "28_energy_max" "Énergie 5, amis, luxe, extérieur" \
  --auto --persona "On veut se défoncer physiquement" \
  --social friends --energy 5 --budget luxury --env outdoor

run_test "29_budget_free_outdoor" "Gratuit, couple, extérieur" \
  --auto --persona "Balade gratuite en amoureux" \
  --social couple --energy 3 --budget free --env outdoor

run_test "30_budget_luxury_solo" "Luxe, seul, intérieur" \
  --auto --persona "Je veux me faire plaisir sans compter" \
  --social solo --energy 3 --budget luxury --env indoor

run_test "31_any_env" "Environnement indifférent, famille" \
  --auto --persona "On s'en fiche intérieur ou extérieur" \
  --social family --energy 3 --budget standard --env any_env

run_test "32_extreme_combo" "Énergie max, gratuit, famille, bébé" \
  --auto --persona "Énergie à revendre mais pas un sou" \
  --social family --energy 5 --budget free --env outdoor --children-ages "0,2"

# =============================================
# LOT 6 : Personas spécifiques (10 tests)
# =============================================
echo ""
echo "--- LOT 6 : Personas spécifiques ---"

run_test "33_gamer" "Gamer seul" \
  --auto --persona "Je veux jouer à un jeu vidéo" \
  --social solo --energy 2 --budget standard --env indoor

run_test "34_cinema" "Cinéma entre amis" \
  --auto --persona "On veut aller au cinéma" \
  --social friends --energy 2 --budget standard --env indoor

run_test "35_sport" "Sport intense" \
  --auto --persona "Je veux faire du sport intense" \
  --social solo --energy 5 --budget budget --env outdoor

run_test "36_creative" "Activité créative" \
  --auto --persona "Je veux créer quelque chose de mes mains" \
  --social solo --energy 3 --budget standard --env indoor

run_test "37_gastronomie" "Sortie gastronomique" \
  --auto --persona "On veut découvrir un bon restaurant" \
  --social couple --energy 2 --budget luxury --env indoor

run_test "38_nature" "Randonnée nature" \
  --auto --persona "Je veux me reconnecter avec la nature" \
  --social solo --energy 4 --budget free --env outdoor

run_test "39_culture" "Sortie culturelle" \
  --auto --persona "Je veux voir une expo ou un spectacle" \
  --social couple --energy 2 --budget standard --env indoor

run_test "40_party" "Soirée festive" \
  --auto --persona "On veut faire la fête ce soir" \
  --social friends --energy 5 --budget standard --env any_env

run_test "41_zen" "Détente zen" \
  --auto --persona "Je veux méditer et me recentrer" \
  --social solo --energy 1 --budget free --env indoor

run_test "42_adventure" "Aventure insolite" \
  --auto --persona "Je cherche une expérience hors du commun" \
  --social friends --energy 5 --budget luxury --env outdoor

# =============================================
# LOT 7 : Combinaisons croisées (8 tests)
# =============================================
echo ""
echo "--- LOT 7 : Combinaisons croisées ---"

run_test "43_couple_kids" "Couple avec enfants 3-6, gratuit" \
  --auto --persona "Sortie en famille avec petits enfants" \
  --social family --energy 3 --budget free --env outdoor --children-ages "3,6"

run_test "44_teen_winter" "Ados en hiver, intérieur" \
  --auto --persona "Activité intérieure pour ados en hiver" \
  --social family --energy 4 --budget standard --env indoor --timing "2026-01-15" --children-ages "13,16"

run_test "45_friends_summer_en" "Amis, été, anglais" \
  --auto --persona "Summer outdoor activity with friends" \
  --social friends --energy 5 --budget budget --env outdoor --timing "2026-07-01" --lang en

run_test "46_solo_rainy" "Seul, jour de pluie" \
  --auto --persona "Il pleut, je m'ennuie chez moi" \
  --social solo --energy 2 --budget budget --env indoor

run_test "47_family_xmas" "Noël en famille, enfants 4-10" \
  --auto --persona "Activité de Noël en famille" \
  --social family --energy 3 --budget standard --env indoor --timing "2026-12-25" --children-ages "4,10"

run_test "48_couple_spring_es" "Couple, printemps, espagnol" \
  --auto --persona "Actividad romántica de primavera" \
  --social couple --energy 3 --budget standard --env outdoor --timing "2026-04-20" --lang es

run_test "49_solo_night" "Seul, nuit, énergie basse" \
  --auto --persona "Il est tard, je ne dors pas, que faire" \
  --social solo --energy 1 --budget free --env indoor

run_test "50_full_combo" "Combo complet : famille, enfants, timing, luxe" \
  --auto --persona "Weekend de luxe en famille avec les enfants" \
  --social family --energy 4 --budget luxury --env any_env --timing "2026-06-13" --children-ages "6,12"

# =============================================
# RAPPORT FINAL
# =============================================
echo ""
echo "============================================"
echo "📊 RAPPORT FINAL"
echo "============================================"
echo "✅ Passés : $PASS"
echo "❌ Échoués : $FAIL"
echo "Total : $((PASS + FAIL))"
echo ""

if [ $FAIL -gt 0 ]; then
  echo "--- Détail des échecs ---"
  echo -e "$ERRORS"
  echo ""
fi

# Générer un résumé JSON
node -e "
const fs = require('fs');
const path = require('path');
const dir = '$RUN_DIR';
const files = fs.readdirSync(dir).filter(f => f.endsWith('.json'));
const summary = { pass: $PASS, fail: $FAIL, timestamp: '$TIMESTAMP', tests: [] };
for (const f of files) {
  try {
    const d = JSON.parse(fs.readFileSync(path.join(dir, f), 'utf-8'));
    summary.tests.push({
      id: f.replace('.json',''),
      steps: d.steps?.length ?? 0,
      duration: d.totalDurationMs ?? 0,
      pivots: d.pivotCount ?? 0,
      finalized: d.finalResponse?.statut === 'finalisé',
      titre: d.finalResponse?.recommandation_finale?.titre ?? null,
      actions: d.finalResponse?.recommandation_finale?.actions?.length ?? 0,
      actionTypes: d.finalResponse?.recommandation_finale?.actions?.map(a => a.type) ?? [],
    });
  } catch {}
}
fs.writeFileSync(path.join(dir, 'summary.json'), JSON.stringify(summary, null, 2));
console.log('Résumé sauvegardé: ' + path.join(dir, 'summary.json'));
"

echo ""
echo "Transcripts : $RUN_DIR/"
echo "============================================"
