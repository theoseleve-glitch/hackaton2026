import type { PlayerId } from '@bloop/engine';
import type { Presence } from '@bloop/kit';

/** Bilingual content string — carried through views AS-IS; the client picks a locale at render time. */
export interface LText {
  fr: string;
  en: string;
}

/**
 * One confession statement card ("J'ai déjà ghosté quelqu'un…"). Legacy single
 * locale is allowed (a plain string) but wave-2 packs author {fr,en}. The
 * reducer never inspects a statement — it flows from the pack through view()
 * untouched, so a mixed array is also valid.
 */
export type WhoSaidThatStatement = string | LText;

export interface WhoSaidThatConfig {
  /** Number of statement cards played. Clamped to the pack size at init. */
  totalRounds: number;
  /** CONFESS phase duration (secret MOI / PAS MOI). */
  confessMs: number;
  /** ATTRIBUTE phase duration (single accusation; the public count is the clue). */
  attributeMs: number;
  /** REVEAL phase duration (confessor set + scores). */
  revealMs: number;
  /** Points an accuser scores when their accusation lands on a real confessor. */
  hitPoints: number;
  /** Bonus a confessor scores when NOBODY accused them (they got away with it). */
  ghostBonus: number;
}

export const DEFAULT_CONFIG: WhoSaidThatConfig = {
  totalRounds: 6,
  confessMs: 12_000,
  attributeMs: 20_000,
  revealMs: 8_000,
  hitPoints: 1,
  ghostBonus: 1,
};

export type WhoSaidThatPhase = 'confess' | 'attribute' | 'reveal' | 'over';

/**
 * One resolved round, promoted from the hidden buffers at reveal. Everything
 * here is value-secret until the atomic reveal: `confessors` (who said MOI),
 * `accusations` (who pointed at whom), and the score deltas. The confessor
 * COUNT alone becomes public at the attribute phase (it is the only clue);
 * identities + accusations only land here.
 */
export interface RoundResult {
  /** The MOI players, in roster order (who confessed). Public ONLY at reveal. */
  confessors: PlayerId[];
  /** accuser -> accused, every accusation made this round. Public ONLY at reveal. */
  accusations: Record<PlayerId, PlayerId>;
  /** Accusers whose accusation landed on a real confessor (scored +hitPoints). */
  hits: PlayerId[];
  /** Confessors NOBODY accused (scored +ghostBonus — they got away with it). */
  ghosts: PlayerId[];
  /** Per-player points awarded THIS round (kit scoreDelta animates the climb). */
  delta: Record<PlayerId, number>;
}

/**
 * P1 CC-5 cliffhanger epilogue — derived at `over` from ALREADY-PUBLIC final
 * scores only (no new in-match secret). Feeds the shell Oracle roast + the
 * rematch CTA.
 */
export interface WhoSaidThatEpilogue {
  /** True when the top-2 score gap is within the close-finish threshold (a nailbiter). */
  closeFinish: boolean;
  /** Top-2 score gap (0 on a tie / solo). */
  topGap: number;
  /** The sole crowned player, or null on a contested (tied-for-first) crown. */
  mvp: PlayerId | null;
}

export interface WhoSaidThatState {
  config: WhoSaidThatConfig;
  players: PlayerId[];
  connected: Presence;
  statements: WhoSaidThatStatement[];
  round: number;
  phase: WhoSaidThatPhase;
  /**
   * HIDDEN buffer — every player's secret MOI(true)/PAS MOI(false). Never
   * exposed through view() during confess (not even the count). The count
   * becomes public when the phase flips to 'attribute'; the identities only at
   * reveal. A re-tap before the phase resolves overwrites the prior value.
   */
  confessions: Record<PlayerId, boolean>;
  /**
   * HIDDEN buffer — accuser -> accused (a single accusation, like tracer's
   * vote). Never exposed pre-reveal beyond the owner's own echo + a
   * hasAccused map. You cannot accuse yourself. Promoted to public at reveal.
   */
  accusations: Record<PlayerId, PlayerId>;
  scores: Record<PlayerId, number>;
  /** Promoted from the hidden buffers at resolve — public from reveal on. */
  lastResult: RoundResult | null;
}

/**
 * The taps-only action: a discriminated union. CONFESS is a secret boolean
 * (MOI = true, PAS MOI = false); ATTRIBUTE is a single accusation at another
 * player. Zero free text — taps only, so there is zero moderation surface.
 */
export type WhoSaidThatAction =
  | { kind: 'confess'; value: boolean }
  | { kind: 'accuse'; target: PlayerId };

export type WhoSaidThatView =
  | {
      phase: 'confess';
      round: number;
      totalRounds: number;
      statement: WhoSaidThatStatement;
      /** Who has secretly confessed (acted), per player. NOT the value — just acted-or-not. */
      hasConfessed: Record<PlayerId, boolean>;
      /** The OWNER's own hidden confession echoed back (null until they tap). */
      myConfession: boolean | null;
      scores: Record<PlayerId, number>;
    }
  | {
      phase: 'attribute';
      round: number;
      totalRounds: number;
      statement: WhoSaidThatStatement;
      /**
       * THE CLUE — how many players confessed MOI this round. Public ONLY from
       * the attribute phase on; it never names WHO, just the count. Derived from
       * the now-frozen confession buffer.
       */
      confessorCount: number;
      /** Who has accused (acted), per player. NOT the target — just acted-or-not. */
      hasAccused: Record<PlayerId, boolean>;
      /** The OWNER's own hidden accusation echoed back (null until they tap). */
      myAccusation: PlayerId | null;
      scores: Record<PlayerId, number>;
    }
  | {
      phase: 'reveal';
      round: number;
      totalRounds: number;
      statement: WhoSaidThatStatement;
      /** The full round result, promoted from the hidden buffers (public NOW). */
      result: RoundResult;
      scores: Record<PlayerId, number>;
    }
  | {
      phase: 'over';
      scores: Record<PlayerId, number>;
      /**
       * P1 CC-5 cliffhanger epilogue, derived from the PUBLIC final scores only
       * (no new in-match secret). Powers the rematch CTA + Oracle roast.
       */
      cliffhanger: WhoSaidThatEpilogue;
    };
