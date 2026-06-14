// apps/mobile/src/games/catalog.ts
// PURE module — no react-native imports.
// Wave-2 catalog (design doc 2026-06-11-wave2-17-games-design.md): the 17
// co-founder games + tracer. Card backgrounds use the inspiration video's
// YouTube thumbnail (content/inspiration-videos.json) with creator credit,
// tap-through to the original — never embedded.

import type { Bilingual } from '../i18n';

export interface GameVideo {
  creator: string;
  url: string;
  /** Platform-served thumbnail (i.ytimg.com). Absent = emoji/color card. */
  thumbnailUrl?: string;
}

export interface GameCard {
  id: string;
  name: Bilingual;
  tagline: Bilingual;
  emoji: string;
  color: string;
  badge: 'PLAY' | 'SOON';
  video?: GameVideo;
}

export const GAME_CATALOG: readonly GameCard[] = [
  {
    id: 'tu-preferes',
    name: { fr: 'Tu Préfères ?', en: 'Would You Rather' },
    tagline: { fr: 'Deux choix, zéro échappatoire. Devine le camp de tes potes !', en: 'Two options, no escape. Call which side the room picks!' },
    emoji: '🤔',
    color: '#FF6F61',
    badge: 'PLAY',
    video: { creator: 'Squeezie', url: 'https://www.youtube.com/watch?v=AFGvDndE2yc', thumbnailUrl: 'https://i.ytimg.com/vi/AFGvDndE2yc/hqdefault.jpg' },
  },
  {
    id: 'gauche-ou-droite',
    name: { fr: 'De gauche ou de droite ?', en: 'Left-Coded or Right-Coded?' },
    tagline: { fr: 'La raclette : de gauche ou de droite ? Vote, regarde la salle se déchirer, puis débats.', en: 'Is brunch left-coded or right-coded? Vote, watch the room split, then argue it out.' },
    emoji: '🥐',
    color: '#5B7BFF',
    badge: 'PLAY',
    // Inspiration is a website (no thumbnail): emoji card, credit links out.
    video: { creator: 'Théo Delemazure', url: 'https://degaucheoudedroite.delemazure.fr/' },
  },
  {
    id: 'tracer',
    name: { fr: 'Vote Éclair', en: 'Quick Vote' },
    tagline: { fr: 'Qui colle le mieux ? Tape pour voter.', en: 'Who fits? Tap to vote.' },
    emoji: '🗳️',
    color: '#4ECDC4',
    badge: 'PLAY',
  },
  {
    id: 'pires-potes',
    name: { fr: 'Pires Potes', en: 'Worst Mates' },
    tagline: { fr: 'Chaque question désigne un coupable. Le pire pote gagne.', en: 'Every question points a finger. The worst friend wins.' },
    emoji: '😬',
    color: '#FF6B9D',
    badge: 'PLAY',
    video: { creator: 'Sidemen', url: 'https://www.youtube.com/watch?v=8ASuvsqne1o', thumbnailUrl: 'https://i.ytimg.com/vi/8ASuvsqne1o/hqdefault.jpg' },
  },
  {
    id: 'truth-or-dare-2',
    name: { fr: 'Action ou Vérité — Fun & Lover', en: 'Truth or Dare — Fun & Lover' },
    tagline: { fr: 'Deux ambiances : la soirée entre potes, ou le tête-à-tête qui chauffe.', en: 'Two vibes: party night with the crew, or date night that heats up.' },
    emoji: '😈',
    color: '#FFCC4D',
    badge: 'PLAY',
    video: { creator: 'Cut', url: 'https://www.youtube.com/watch?v=pxYpvNMbdXQ', thumbnailUrl: 'https://i.ytimg.com/vi/pxYpvNMbdXQ/hqdefault.jpg' },
  },
  {
    id: 'truth-or-drink',
    name: { fr: 'Vérité ou tu Bois', en: 'Truth or Drink' },
    tagline: { fr: 'Une question vérité : tu réponds… ou tu bois. Santé !', en: 'One truth question: answer it… or drink. Cheers!' },
    emoji: '🍻',
    color: '#B6A8FF',
    badge: 'PLAY',
    video: { creator: 'Cut', url: 'https://www.youtube.com/watch?v=2WZ8iJX4FL0', thumbnailUrl: 'https://i.ytimg.com/vi/2WZ8iJX4FL0/hqdefault.jpg' },
  },
  {
    id: 'double-jeu',
    name: { fr: 'Double Jeu', en: 'Double Agent' },
    tagline: { fr: 'Tout le monde a reçu le même mot… sauf un. Deux votes pour le démasquer.', en: 'Everyone got the same word… except one. Two votes to unmask them.' },
    emoji: '🕵️',
    color: '#FF6F61',
    badge: 'PLAY',
    video: { creator: 'Jubilee', url: 'https://www.youtube.com/watch?v=z5TGgJF7LIo', thumbnailUrl: 'https://i.ytimg.com/vi/z5TGgJF7LIo/hqdefault.jpg' },
  },
  {
    id: 'quizz-culture-ge',
    name: { fr: 'Au Pif !', en: 'Ballpark!' },
    tagline: { fr: 'La culture gé au doigt mouillé : personne ne sait, le plus proche rafle tout.', en: 'Trivia where nobody knows the answer — closest guess takes it all.' },
    emoji: '🎯',
    color: '#5B7BFF',
    badge: 'PLAY',
    video: { creator: 'McFly & Carlito', url: 'https://www.youtube.com/watch?v=y5YRzetgNjI', thumbnailUrl: 'https://i.ytimg.com/vi/y5YRzetgNjI/hqdefault.jpg' },
  },
  {
    id: 'cinquante-cinquante',
    name: { fr: 'Cinquante-Cinquante', en: 'Fifty-Fifty' },
    tagline: { fr: 'Complète la phrase, vise le pourcentage de la foule.', en: "Finish the line, hit the crowd's number." },
    emoji: '📊',
    color: '#4ECDC4',
    badge: 'PLAY',
    video: { creator: 'Beta Squad', url: 'https://www.youtube.com/watch?v=gIhxUb45Dic', thumbnailUrl: 'https://i.ytimg.com/vi/gIhxUb45Dic/hqdefault.jpg' },
  },
  {
    id: 'jeu-de-la-note',
    name: { fr: 'La Note', en: 'On a Scale' },
    tagline: { fr: 'Un chiffre secret en tête. À vous de lire dans ses pensées.', en: "They've got a secret number in mind. Read them like a book." },
    emoji: '🎚️',
    color: '#FF6B9D',
    badge: 'PLAY',
    video: { creator: 'Smosh Games', url: 'https://www.youtube.com/watch?v=BpInB7G4ld8', thumbnailUrl: 'https://i.ytimg.com/vi/BpInB7G4ld8/hqdefault.jpg' },
  },
  {
    id: 'devine-la-question',
    name: { fr: 'Devine la Question', en: 'Guess the Question' },
    tagline: { fr: "Tu as sa réponse. Mais c'était quoi la question ?", en: "You've got their answer. But what was the question?" },
    emoji: '❓',
    color: '#FFCC4D',
    badge: 'PLAY',
    video: { creator: 'Smosh Games', url: 'https://www.youtube.com/watch?v=uvfoC_NbWY0', thumbnailUrl: 'https://i.ytimg.com/vi/uvfoC_NbWY0/hqdefault.jpg' },
  },
  {
    id: 'devine-l-action',
    name: { fr: "Devine l'Action", en: 'Guess the Action' },
    tagline: { fr: 'Toute la pièce connaît ton action — interdit de te la dire !', en: "The whole room knows your action — they just can't say it." },
    emoji: '🎬',
    color: '#B6A8FF',
    badge: 'PLAY',
    video: { creator: 'Sidemen', url: 'https://www.youtube.com/watch?v=fmvJzLgb0l0', thumbnailUrl: 'https://i.ytimg.com/vi/fmvJzLgb0l0/hqdefault.jpg' },
  },
  {
    id: 'devine-l-objet',
    name: { fr: "Devine l'Objet", en: 'Guess the Object' },
    tagline: { fr: 'Un objet secret, zéro mot, 45 secondes pour le faire deviner à la pièce !', en: 'One secret object, zero words, 45 seconds to make the room guess it!' },
    emoji: '🔍',
    color: '#FF6F61',
    badge: 'PLAY',
    video: { creator: 'Collins Key', url: 'https://www.youtube.com/watch?v=WKfIP4-fu6w', thumbnailUrl: 'https://i.ytimg.com/vi/WKfIP4-fu6w/hqdefault.jpg' },
  },
  {
    id: 'mime-inverse',
    name: { fr: 'Mime Inversé', en: 'Reverse Mime' },
    tagline: { fr: 'Tes potes te télécommandent — devine ce qu’ils te font mimer !', en: "Your friends remote-control you — guess what they're making you mime!" },
    emoji: '🎭',
    color: '#5B7BFF',
    badge: 'PLAY',
    video: { creator: 'The Tonight Show', url: 'https://www.youtube.com/watch?v=VTJZ1Sb6mBw', thumbnailUrl: 'https://i.ytimg.com/vi/VTJZ1Sb6mBw/hqdefault.jpg' },
  },
  {
    id: 'double-le-mouvement',
    name: { fr: 'Double le Mouvement', en: 'Dub the Move' },
    tagline: { fr: "L'un mime le délire, l'autre le double en direct — le salon note le duo.", en: 'One friend does the move, the other dubs it live — the room rates the duo.' },
    emoji: '🎤',
    color: '#4ECDC4',
    badge: 'PLAY',
    video: { creator: 'Sofyan', url: 'https://www.youtube.com/watch?v=66IcZxKmZFM', thumbnailUrl: 'https://i.ytimg.com/vi/66IcZxKmZFM/hqdefault.jpg' },
  },
  {
    id: 'jeu-du-theme',
    name: { fr: 'Le Jeu du Thème', en: 'Last Word Standing' },
    tagline: { fr: 'Un thème, une lettre, un mot — le dernier debout rafle la mise !', en: 'One theme, one letter, one word — last one standing takes it all!' },
    emoji: '🔤',
    color: '#FF6B9D',
    badge: 'PLAY',
    video: { creator: 'Sidemen', url: 'https://www.youtube.com/watch?v=lFgWzluCnEQ', thumbnailUrl: 'https://i.ytimg.com/vi/lFgWzluCnEQ/hqdefault.jpg' },
  },
  {
    id: 'trouvez-la-regle',
    name: { fr: 'Trouvez la Règle', en: 'Find the Rule' },
    tagline: { fr: 'Toute la pièce suit une règle secrète. Sauf toi. Démasque-la avant la fin du chrono.', en: 'The whole room is following a secret rule. Except you. Crack it before the clock runs out.' },
    emoji: '📜',
    color: '#FFCC4D',
    badge: 'PLAY',
    video: { creator: 'JOYCA', url: 'https://www.youtube.com/watch?v=ol144MIpscY', thumbnailUrl: 'https://i.ytimg.com/vi/ol144MIpscY/hqdefault.jpg' },
  },
  {
    id: 'loup-garou',
    name: { fr: 'Loup-Garou', en: 'Werewolf' },
    tagline: { fr: 'Le village dort. Pas les loups.', en: "The village sleeps. The wolves don't." },
    emoji: '🐺',
    color: '#B6A8FF',
    badge: 'PLAY',
    video: { creator: 'Sidemen', url: 'https://www.youtube.com/watch?v=KJnMF96K5pI', thumbnailUrl: 'https://i.ytimg.com/vi/KJnMF96K5pI/hqdefault.jpg' },
  },
  {
    id: 'le-classement',
    name: { fr: 'Le Classement', en: 'The Ranking' },
    tagline: { fr: 'Du plus… au moins… : classe toute la salle, puis vise le verdict du groupe.', en: 'Most… to least… : rank the whole room, then call the group verdict.' },
    emoji: '🪜',
    color: '#FF6F61',
    badge: 'PLAY',
    video: { creator: 'Sidemen', url: 'https://www.youtube.com/watch?v=UVimmI3SooI', thumbnailUrl: 'https://i.ytimg.com/vi/UVimmI3SooI/hqdefault.jpg' },
  },
] as const;
