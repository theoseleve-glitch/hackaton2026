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
    hook: { fr: 'un seul doigt se lève. pas de procès, juste le verdict.', en: 'one finger goes up. no trial, just the verdict.' },
    accent: '#FFCC4D' },
  { id: 'pires-potes', name: { fr: 'Pires Potes', en: 'Worst Mates' },
    hook: { fr: 'les votes s’empilent sur une seule personne toute la soirée. elle est dans la pièce.', en: 'the votes keep landing on one person all night. they’re in the room.' },
    accent: '#FF6B9D', creator: 'inspired by Squeezie', spicy: true },
  { id: 'tu-preferes', name: { fr: 'Tu Préfères ?', en: 'Would You Rather' },
    hook: { fr: 'deux options, aucune défendable. et tu paries sur ce que la table va choisir.', en: 'two options, neither survivable. now bet on what your mates actually pick.' },
    accent: '#5B7BFF', creator: 'inspired by Squeezie' },
  { id: 'gauche-droite', name: { fr: 'De gauche ou de droite ?', en: 'Left- or Right-Coded?' },
    hook: { fr: 'les crocs, c’est de droite. défends. t’as trente secondes.', en: 'crocs are right-coded. defend it. thirty seconds.' },
    accent: '#4ECDC4' },
  { id: 'au-pif', name: { fr: 'Au Pif !', en: 'Ballpark!' },
    hook: { fr: 'le mec qui dit « bah au pif » et qui tombe pile. tu vas le détester.', en: 'someone shrugs, guesses, lands dead-on. enjoy hating them.' },
    accent: '#FFCC4D', creator: 'inspired by McFly & Carlito' },
  { id: 'cinquante', name: { fr: 'Cinquante-Cinquante', en: 'Fifty-Fifty' },
    hook: { fr: 'tout le monde l’a déjà fait. devine combien l’avouent.', en: 'everyone’s done it. guess how many will admit it.' },
    accent: '#B6A8FF' },
  { id: 'double-jeu', name: { fr: 'Double Jeu', en: 'Double Agent' },
    hook: { fr: 'même mot pour tous, sauf un. il parle déjà comme s’il savait.', en: 'same word for everyone but one. and they’re already bluffing it.' },
    accent: '#5B7BFF' },
  { id: 'action-verite', name: { fr: 'Action ou Vérité', en: 'Truth or Dare' },
    hook: { fr: 'soirée qui dérape ou tête-à-tête qui chauffe : les vérités que sobre tu nierais.', en: 'crew night or just the two of you. truths sober-you would deny.' },
    accent: '#FF6F61', spicy: true },
  { id: 'loup-garou', name: { fr: 'Loup-Garou', en: 'Werewolf' },
    hook: { fr: 'le village s’endort entier. au matin, il en manquera un.', en: 'the village sleeps whole. by morning one of you is gone.' },
    accent: '#0F1633' },
];
