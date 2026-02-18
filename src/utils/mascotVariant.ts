/** Variantes de mascotte — une par catégorie thématique */
export type MascotVariant =
  | "calm_escape"
  | "culture_knowledge"
  | "food_drink"
  | "move_sport"
  | "music_crea"
  | "nature_adventure"
  | "social_fun"
  | "story_screen";

/** Determine la variante de mascotte a partir des tags de la recommandation */
export function getMascotVariant(tags?: string[]): MascotVariant {
  if (tags?.[0] && tags[0] in MASCOT_IMAGES) return tags[0] as MascotVariant;
  return "calm_escape";
}

/** Images des variantes de mascotte — Metro requiert des require() statiques */
export const MASCOT_IMAGES: Record<MascotVariant, ReturnType<typeof require>> = {
  calm_escape:       require("../../assets/images/destiny-parchment/mogogo-calm_escape.webp"),
  culture_knowledge: require("../../assets/images/destiny-parchment/mogogo-culture_knowledge.webp"),
  food_drink:        require("../../assets/images/destiny-parchment/mogogo-food_drink.webp"),
  move_sport:        require("../../assets/images/destiny-parchment/mogogo-move_sport.webp"),
  music_crea:        require("../../assets/images/destiny-parchment/mogogo-music_crea.webp"),
  nature_adventure:  require("../../assets/images/destiny-parchment/mogogo-nature_adventure.webp"),
  social_fun:        require("../../assets/images/destiny-parchment/mogogo-social_fun.webp"),
  story_screen:      require("../../assets/images/destiny-parchment/mogogo-story_screen.webp"),
};
