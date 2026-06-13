export interface Game {
  id: string;
  name: { fr: string; en: string };
  hook: { fr: string; en: string };
  accent: string;
  creator?: string;
  spicy?: boolean;
}

export const GAMES: Game[] = [
  { id: 'qui-de-vous', name: { fr: 'Qui de vous…', en: 'Most Likely To' },
    hook: { fr: 'un seul vote désigne le coupable.', en: 'one vote names the guilty one.' },
    accent: '#FFCC4D' },
  { id: 'pires-potes', name: { fr: 'Pires Potes', en: 'Worst Mates' },
    hook: { fr: 'chaque question désigne un coupable. le pire pote gagne.', en: 'every question points a finger. the worst friend wins.' },
    accent: '#FF6B9D', creator: 'inspired by Squeezie', spicy: true },
  { id: 'tu-preferes', name: { fr: 'Tu Préfères ?', en: 'Would You Rather' },
    hook: { fr: 'devine la majorité. les deux options coûtent cher.', en: 'predict the majority. both options cost you.' },
    accent: '#5B7BFF', creator: 'inspired by Squeezie' },
  { id: 'gauche-droite', name: { fr: 'De gauche ou de droite ?', en: 'Left- or Right-Coded?' },
    hook: { fr: 'vote le camp. puis défends-le devant tout le monde.', en: 'vote the side. then defend it to the room.' },
    accent: '#4ECDC4' },
  { id: 'au-pif', name: { fr: 'Au Pif !', en: 'Ballpark!' },
    hook: { fr: 'le plus proche gagne. personne n’est largué.', en: 'closest number wins. nobody gets shut out.' },
    accent: '#FFCC4D', creator: 'inspired by McFly & Carlito' },
  { id: 'cinquante', name: { fr: 'Cinquante-Cinquante', en: 'Fifty-Fifty' },
    hook: { fr: 'complète la phrase, vise le pourcentage de la foule.', en: 'finish the line, hit the crowd’s number.' },
    accent: '#B6A8FF' },
  { id: 'double-jeu', name: { fr: 'Double Jeu', en: 'Double Agent' },
    hook: { fr: 'tout le monde voit le même mot. sauf un. démasque-le.', en: 'everyone sees the same word. except one. unmask them.' },
    accent: '#5B7BFF' },
  { id: 'action-verite', name: { fr: 'Action ou Vérité', en: 'Truth or Dare' },
    hook: { fr: 'deux ambiances : la soirée entre potes, ou le tête-à-tête qui chauffe.', en: 'two vibes: party night, or the date that heats up.' },
    accent: '#FF6F61', spicy: true },
  { id: 'loup-garou', name: { fr: 'Loup-Garou', en: 'Werewolf' },
    hook: { fr: 'le village dort. quelqu’un ment.', en: 'the village sleeps. someone is lying.' },
    accent: '#0F1633' },
];
