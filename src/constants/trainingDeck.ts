export interface TrainingCardData {
  id: number;
  titleKey: string;
  descriptionKey: string;
  emoji: string;
  tags: string[];
}

export const TRAINING_DECK: TrainingCardData[] = [
  { id: 1,  titleKey: "training.cards.football",    descriptionKey: "training.desc.football",    emoji: "⚽",       tags: ["sport", "social"] },
  { id: 2,  titleKey: "training.cards.museum",       descriptionKey: "training.desc.museum",       emoji: "🎭", tags: ["culture"] },
  { id: 3,  titleKey: "training.cards.gastro",        descriptionKey: "training.desc.gastro",        emoji: "🍽️", tags: ["gastronomie"] },
  { id: 4,  titleKey: "training.cards.hiking",        descriptionKey: "training.desc.hiking",        emoji: "🏞️", tags: ["nature", "sport"] },
  { id: 5,  titleKey: "training.cards.spa",           descriptionKey: "training.desc.spa",           emoji: "🧘", tags: ["detente"] },
  { id: 6,  titleKey: "training.cards.karaoke",       descriptionKey: "training.desc.karaoke",       emoji: "🎤", tags: ["fete", "musique"] },
  { id: 7,  titleKey: "training.cards.pottery",       descriptionKey: "training.desc.pottery",       emoji: "🎨", tags: ["creatif"] },
  { id: 8,  titleKey: "training.cards.boardgames",    descriptionKey: "training.desc.boardgames",    emoji: "🎲", tags: ["jeux", "social"] },
  { id: 9,  titleKey: "training.cards.concert",       descriptionKey: "training.desc.concert",       emoji: "🎵", tags: ["musique", "fete"] },
  { id: 10, titleKey: "training.cards.cinema",        descriptionKey: "training.desc.cinema",        emoji: "🎬", tags: ["cinema"] },
  { id: 11, titleKey: "training.cards.roadtrip",      descriptionKey: "training.desc.roadtrip",      emoji: "🚗", tags: ["voyage", "nature"] },
  { id: 12, titleKey: "training.cards.escapegame",    descriptionKey: "training.desc.escapegame",    emoji: "🔓", tags: ["tech", "jeux"] },
  { id: 13, titleKey: "training.cards.brunch",        descriptionKey: "training.desc.brunch",        emoji: "🥐", tags: ["gastronomie", "social"] },
  { id: 14, titleKey: "training.cards.geocaching",    descriptionKey: "training.desc.geocaching",    emoji: "🗺️", tags: ["insolite", "nature"] },
  { id: 15, titleKey: "training.cards.cookingclass",  descriptionKey: "training.desc.cookingclass",  emoji: "👨‍🍳", tags: ["gastronomie", "creatif"] },
];
