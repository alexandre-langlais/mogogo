export interface TrainingCardData {
  id: number;
  titleKey: string;
  descriptionKey: string;
  emoji: string;
  tags: string[];
}

export const TRAINING_DECK: TrainingCardData[] = [
  { id: 1, titleKey: "training.cards.workout",    descriptionKey: "training.desc.workout",    emoji: "💪", tags: ["move_sport"] },
  { id: 2, titleKey: "training.cards.creative",   descriptionKey: "training.desc.creative",   emoji: "🎨", tags: ["music_crea"] },
  { id: 3, titleKey: "training.cards.museum",     descriptionKey: "training.desc.museum",     emoji: "📚", tags: ["culture_knowledge"] },
  { id: 4, titleKey: "training.cards.hangout",    descriptionKey: "training.desc.hangout",    emoji: "🥂", tags: ["social_fun"] },
  { id: 5, titleKey: "training.cards.spa",        descriptionKey: "training.desc.spa",        emoji: "🧘", tags: ["calm_escape"] },
  { id: 6, titleKey: "training.cards.escapegame", descriptionKey: "training.desc.escapegame", emoji: "🎮", tags: ["social_fun"] },
  { id: 7, titleKey: "training.cards.hiking",     descriptionKey: "training.desc.hiking",     emoji: "🏞️", tags: ["nature_adventure"] },
  { id: 8, titleKey: "training.cards.diy",        descriptionKey: "training.desc.diy",        emoji: "🏠", tags: ["music_crea"] },
];
