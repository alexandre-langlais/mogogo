export interface TrainingCardData {
  id: number;
  titleKey: string;
  descriptionKey: string;
  emoji: string;
  tags: string[];
}

export const TRAINING_DECK: TrainingCardData[] = [
  { id: 1, titleKey: "training.cards.workout",    descriptionKey: "training.desc.workout",    emoji: "💪", tags: ["sport"] },
  { id: 2, titleKey: "training.cards.creative",   descriptionKey: "training.desc.creative",   emoji: "🎨", tags: ["arts"] },
  { id: 3, titleKey: "training.cards.museum",     descriptionKey: "training.desc.museum",     emoji: "📚", tags: ["savoir"] },
  { id: 4, titleKey: "training.cards.hangout",    descriptionKey: "training.desc.hangout",    emoji: "🥂", tags: ["social"] },
  { id: 5, titleKey: "training.cards.spa",        descriptionKey: "training.desc.spa",        emoji: "🧘", tags: ["bien_etre"] },
  { id: 6, titleKey: "training.cards.escapegame", descriptionKey: "training.desc.escapegame", emoji: "🎮", tags: ["jeux"] },
  { id: 7, titleKey: "training.cards.hiking",     descriptionKey: "training.desc.hiking",     emoji: "🏞️", tags: ["nature"] },
  { id: 8, titleKey: "training.cards.diy",        descriptionKey: "training.desc.diy",        emoji: "🏠", tags: ["maison"] },
];
