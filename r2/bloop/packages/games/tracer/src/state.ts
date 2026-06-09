import type { PlayerId } from '@bloop/engine';

export interface TracerConfig {
  totalRounds: number;
  voteMs: number;
  revealMs: number;
}

export const DEFAULT_CONFIG: TracerConfig = {
  totalRounds: 3,
  voteMs: 30_000,
  revealMs: 5_000,
};

export type TracerPhase = 'vote' | 'reveal' | 'over';

export interface TracerState {
  config: TracerConfig;
  players: PlayerId[];
  prompts: string[];
  round: number;
  phase: TracerPhase;
  /** HIDDEN: never exposed through view(). */
  votes: Record<PlayerId, PlayerId>;
  scores: Record<PlayerId, number>;
}

export type TracerAction = { kind: 'vote'; target: PlayerId };

export type TracerView =
  | {
      phase: 'vote';
      round: number;
      totalRounds: number;
      prompt: string;
      hasVoted: Record<PlayerId, boolean>;
      myVote: PlayerId | null;
      scores: Record<PlayerId, number>;
    }
  | {
      phase: 'reveal';
      round: number;
      totalRounds: number;
      prompt: string;
      tally: Record<PlayerId, number>;
      scores: Record<PlayerId, number>;
    }
  | { phase: 'over'; scores: Record<PlayerId, number> };
