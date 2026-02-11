export interface TrainingCardData {
  id: number;
  titleKey: string;
  descriptionKey: string;
  emoji: string;
  tags: string[];
}

export const TRAINING_DECK: TrainingCardData[] = [
  { id: 1,  titleKey: "training.cards.football",    descriptionKey: "training.desc.football",    emoji: "\u26BD",       tags: ["sport", "social"] },
  { id: 2,  titleKey: "training.cards.museum",       descriptionKey: "training.desc.museum",       emoji: "\uD83C\uDFAD", tags: ["culture"] },
  { id: 3,  titleKey: "training.cards.gastro",        descriptionKey: "training.desc.gastro",        emoji: "\uD83C\uDF7D\uFE0F", tags: ["gastronomie"] },
  { id: 4,  titleKey: "training.cards.hiking",        descriptionKey: "training.desc.hiking",        emoji: "\uD83C\uDFDE\uFE0F", tags: ["nature", "sport"] },
  { id: 5,  titleKey: "training.cards.spa",           descriptionKey: "training.desc.spa",           emoji: "\uD83E\uDDD8", tags: ["detente"] },
  { id: 6,  titleKey: "training.cards.karaoke",       descriptionKey: "training.desc.karaoke",       emoji: "\uD83C\uDFA4", tags: ["fete", "musique"] },
  { id: 7,  titleKey: "training.cards.pottery",       descriptionKey: "training.desc.pottery",       emoji: "\uD83C\uDFA8", tags: ["creatif"] },
  { id: 8,  titleKey: "training.cards.boardgames",    descriptionKey: "training.desc.boardgames",    emoji: "\uD83C\uDFB2", tags: ["jeux", "social"] },
  { id: 9,  titleKey: "training.cards.concert",       descriptionKey: "training.desc.concert",       emoji: "\uD83C\uDFB5", tags: ["musique", "fete"] },
  { id: 10, titleKey: "training.cards.cinema",        descriptionKey: "training.desc.cinema",        emoji: "\uD83C\uDFAC", tags: ["cinema"] },
  { id: 11, titleKey: "training.cards.roadtrip",      descriptionKey: "training.desc.roadtrip",      emoji: "\uD83D\uDE97", tags: ["voyage", "nature"] },
  { id: 12, titleKey: "training.cards.escapegame",    descriptionKey: "training.desc.escapegame",    emoji: "\uD83D\uDD13", tags: ["tech", "jeux"] },
  { id: 13, titleKey: "training.cards.brunch",        descriptionKey: "training.desc.brunch",        emoji: "\uD83E\uDD50", tags: ["gastronomie", "social"] },
  { id: 14, titleKey: "training.cards.geocaching",    descriptionKey: "training.desc.geocaching",    emoji: "\uD83D\uDDFA\uFE0F", tags: ["insolite", "nature"] },
  { id: 15, titleKey: "training.cards.cookingclass",  descriptionKey: "training.desc.cookingclass",  emoji: "\uD83D\uDC68\u200D\uD83C\uDF73", tags: ["gastronomie", "creatif"] },
];
