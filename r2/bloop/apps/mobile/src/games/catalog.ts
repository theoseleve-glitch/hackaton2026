// apps/mobile/src/games/catalog.ts
// PURE module — no react-native imports.

export interface GameCard {
  id: string;
  name: string;
  tagline: string;
  emoji: string;
  color: string;
  badge: 'PLAY' | 'SOON';
}

export const GAME_CATALOG: readonly GameCard[] = [
  {
    id: 'tracer',
    name: 'Quick Vote',
    tagline: 'Who fits? Tap to vote.',
    emoji: '🗳️',
    color: '#5B6CFF',
    badge: 'PLAY',
  },
  {
    id: 'impostor',
    name: 'The Impostor',
    tagline: "Find who's faking it.",
    emoji: '🕵️',
    color: '#FF6B6B',
    badge: 'SOON',
  },
  {
    id: 'rank-friends',
    name: 'Rank Your Friends',
    tagline: 'Podium your squad.',
    emoji: '🏆',
    color: '#FF9F43',
    badge: 'SOON',
  },
  {
    id: 'hot-seat',
    name: 'Hot Seat',
    tagline: 'How well do they know you?',
    emoji: '🔥',
    color: '#FF5DA2',
    badge: 'SOON',
  },
  {
    id: 'truth-or-dare',
    name: 'Truth or Dare',
    tagline: 'Pick your poison.',
    emoji: '😈',
    color: '#FF7A3C',
    badge: 'SOON',
  },
  {
    id: 'name3',
    name: 'Name 3 in 5s',
    tagline: 'Blitz! Shout it out.',
    emoji: '⚡',
    color: '#45D0E8',
    badge: 'SOON',
  },
] as const;
