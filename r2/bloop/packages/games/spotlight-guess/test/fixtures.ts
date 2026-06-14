import type { ContentPack, GameEvent } from '@bloop/engine';
import type {
  ReverseItem,
  ScaleItem,
  SpotlightGuessAction,
  SpotlightGuessContent,
  SpotlightGuessState,
} from '@bloop/game-spotlight-guess';

// ---------------------------------------------------------------------------
// Inline content — every string is DIGIT-FREE and globally unique so substring
// redaction asserts can never false-positive against round/score numerals.
// ---------------------------------------------------------------------------

export const scaleItems: ScaleItem[] = [
  {
    id: 'sc-dish',
    kind: 'scale10',
    prompt: { fr: 'Décris un plat qui mérite cette note.', en: 'Describe a dish worth this score.' },
    low: { fr: 'Immangeable', en: 'Inedible' },
    high: { fr: 'Étoilé', en: 'Michelin-star' },
  },
  {
    id: 'sc-excuse',
    kind: 'scale10',
    prompt: { fr: 'Invente une excuse à cette crédibilité.', en: 'Invent an excuse at this believability.' },
    low: { fr: 'Personne ne marche', en: 'Nobody buys it' },
    high: { fr: 'Béton armé', en: 'Airtight' },
  },
  {
    id: 'sc-joke',
    kind: 'scale10',
    prompt: { fr: 'Raconte une blague de ce niveau.', en: 'Tell a joke at this level.' },
    low: { fr: 'Silence gêné', en: 'Awkward silence' },
    high: { fr: 'Fou rire général', en: 'The room loses it' },
  },
];

export const wheelItems: ScaleItem[] = [
  {
    id: 'wh-rated',
    kind: 'wheel100',
    prompt: { fr: 'Cite un truc placé ici sur la roue.', en: 'Name something that sits here on the wheel.' },
    low: { fr: 'Surcoté', en: 'Overrated' },
    high: { fr: 'Sous-coté', en: 'Underrated' },
  },
  {
    id: 'wh-shame',
    kind: 'wheel100',
    prompt: { fr: 'Cite un plat placé ici sur la roue.', en: 'Name a food that sits here on the wheel.' },
    low: { fr: 'Fier en public', en: 'Proudly in public' },
    high: { fr: 'Rideaux tirés', en: 'Blinds down' },
  },
  // Third wheel item: keeps round 0 OUTSIDE the late-round multiplier window
  // (JEU_DE_LA_NOTE_CONFIG boosts the last 2 rounds; a 3-round pool leaves r0 ×1),
  // so the band-ladder assertions read the pure ×1 bands they are testing.
  {
    id: 'wh-skill',
    kind: 'wheel100',
    prompt: { fr: 'Cite un talent placé ici sur la roue.', en: 'Name a skill that sits here on the wheel.' },
    low: { fr: 'Catastrophe ambulante', en: 'Walking disaster' },
    high: { fr: 'Niveau pro', en: 'Pro level' },
  },
];

export const reverseItems: ReverseItem[] = [
  {
    id: 'rq-mirror',
    question: { fr: 'Combien de fois tu te regardes dans le miroir ?', en: 'How often do you check the mirror?' },
    answers: [
      { fr: 'Jamais ou presque', en: 'Almost never' },
      { fr: 'Quelques fois', en: 'A few times' },
      { fr: 'Sans arrêt', en: 'Constantly' },
    ],
    decoys: [
      { fr: 'Combien de fois tu appuies sur snooze ?', en: 'How often do you hit snooze?' },
      { fr: 'Combien de fois tu pleures devant un film ?', en: 'How often do you cry at movies?' },
      { fr: 'Combien de fois tu fais du sport ?', en: 'How often do you work out?' },
      { fr: 'Combien de fois tu as ghosté quelqu’un ?', en: 'How often have you ghosted someone?' },
    ],
    hints: [
      { fr: 'Ça se passe dans la salle de bain.', en: 'It happens in the bathroom.' },
      { fr: 'L’ego est directement concerné.', en: 'Ego is directly involved.' },
    ],
  },
  {
    id: 'rq-lottery',
    question: { fr: 'Qui tu appelles si tu gagnes au loto ?', en: 'Who do you call if you win the lottery?' },
    answers: [
      { fr: 'Ma mère', en: 'My mom' },
      { fr: 'Mon meilleur pote', en: 'My best mate' },
      { fr: 'Personne, je disparais', en: 'No one, I vanish' },
    ],
    decoys: [
      { fr: 'Qui t’aiderait à cacher un corps ?', en: 'Who would help you hide a body?' },
      { fr: 'Qui te connaît le mieux au monde ?', en: 'Who knows you best in the world?' },
      { fr: 'Qui tu préviens si tu pars vivre ailleurs ?', en: 'Who do you tell first if you move abroad?' },
      { fr: 'À qui tu confies ton téléphone déverrouillé ?', en: 'Who gets your unlocked phone?' },
    ],
    hints: [
      { fr: 'Il y a beaucoup d’argent en jeu.', en: 'There is a lot of money involved.' },
      { fr: 'Tout commence par un petit ticket.', en: 'It all starts with a little ticket.' },
    ],
  },
];

export const scaleContent: ContentPack<SpotlightGuessContent> = {
  id: 'test-scale',
  version: 1,
  data: { mode: 'scale', items: scaleItems },
};

export const wheelContent: ContentPack<SpotlightGuessContent> = {
  id: 'test-wheel',
  version: 1,
  data: { mode: 'scale', items: wheelItems },
};

export const reverseContent: ContentPack<SpotlightGuessContent> = {
  id: 'test-reverse',
  version: 1,
  data: { mode: 'reverse-question', items: reverseItems },
};

// ---------------------------------------------------------------------------
// Event helpers
// ---------------------------------------------------------------------------

type Ev = GameEvent<SpotlightGuessAction>;

export const ready = (playerId: string, at = 0): Ev =>
  ({ type: 'action', playerId, action: { kind: 'ready' }, at });

export const openVotes = (playerId: string, at = 0): Ev =>
  ({ type: 'action', playerId, action: { kind: 'openVotes' }, at });

export const answer = (playerId: string, answerIndex: number, at = 0): Ev =>
  ({ type: 'action', playerId, action: { kind: 'answer', answerIndex }, at });

export const guess = (playerId: string, value: number, at = 0): Ev =>
  ({ type: 'action', playerId, action: { kind: 'guess', value }, at });

export const react = (playerId: string, at = 0): Ev =>
  ({ type: 'action', playerId, action: { kind: 'react' }, at });

export const deadline = (at = 0): Ev => ({ type: 'deadline', at });

export const left = (playerId: string, at = 0): Ev => ({ type: 'playerLeft', playerId, at });

export const rejoined = (playerId: string, at = 0): Ev => ({ type: 'playerRejoined', playerId, at });

/** The current spotlight (speaker / mystery player). */
export const spotOf = (s: SpotlightGuessState): string => s.turnOrder[s.spotIndex] ?? '';

/** Roster-ordered connected non-spotlight players. */
export const guessersOf = (s: SpotlightGuessState): string[] =>
  s.players.filter((p) => p !== spotOf(s));
