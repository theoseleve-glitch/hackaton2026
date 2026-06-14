import type { GameModule } from '@bloop/engine';
import {
  CINQUANTE_CINQUANTE_CONFIG,
  createInputGuess,
  inputGuessActionSchema,
  QUIZZ_CULTURE_GE_CONFIG,
} from '@bloop/game-input-guess';
import { createLastStanding, JEU_DU_THEME_CONFIG, lastStandingActionSchema } from '@bloop/game-last-standing';
import { createNightDay, LOUP_GAROU_CONFIG, nightDayActionSchema } from '@bloop/game-night-day';
import {
  createPerformJudge,
  DEVINE_L_ACTION_CONFIG,
  DEVINE_L_OBJET_CONFIG,
  DOUBLE_LE_MOUVEMENT_CONFIG,
  MIME_INVERSE_CONFIG,
  performJudgeActionSchema,
} from '@bloop/game-perform-judge';
import { createRanking, LE_CLASSEMENT_CONFIG, rankingActionSchema } from '@bloop/game-ranking';
import {
  createOptionVote,
  GAUCHE_DROITE_CONFIG,
  optionVoteActionSchema,
  TU_PREFERES_CONFIG,
} from '@bloop/game-option-vote';
import { createRuleHunt, ruleHuntActionSchema, TROUVEZ_LA_REGLE_CONFIG } from '@bloop/game-rule-hunt';
import { createSecretRole, DOUBLE_JEU_CONFIG, secretRoleActionSchema } from '@bloop/game-secret-role';
import {
  createSpotlightGuess,
  DEVINE_LA_QUESTION_CONFIG,
  JEU_DE_LA_NOTE_CONFIG,
  spotlightGuessActionSchema,
} from '@bloop/game-spotlight-guess';
import { createTracer, PIRES_POTES_CONFIG, tracer, tracerActionSchema } from '@bloop/game-tracer';
import {
  createTruthDare,
  truthDareActionSchema,
  TRUTH_OR_DARE_2_CONFIG,
  TRUTH_OR_DRINK_CONFIG,
} from '@bloop/game-truth-dare';
import type { z } from 'zod';

// The registry erases per-game generics; type safety is restored per game by
// the zod schema at the boundary and by the module's own typed tests.
export type AnyGameModule = GameModule<any, any, any, any>;

export interface GameEntry {
  module: AnyGameModule;
  /** Validates client `action.payload` — the protocol leaves it z.unknown() on purpose. */
  actionSchema: z.ZodType<any>;
  /** R2 seam: the CONTENT bucket key (= pack.id) the DO loads at runtime — packs are NOT bundled here. */
  contentRef: string;
}

/** A Map, NOT an object literal: gameId is CLIENT-SUPPLIED — `obj['__proto__']` on a literal would return Object.prototype. */
const REGISTRY = new Map<string, GameEntry>([
  ['tracer', { module: tracer, actionSchema: tracerActionSchema, contentRef: 'tracer-core' }],
  ['pires-potes', {
    module: createTracer('pires-potes', PIRES_POTES_CONFIG),
    actionSchema: tracerActionSchema,
    contentRef: 'pires-potes-core',
  }],
  ['tu-preferes', {
    module: createOptionVote('tu-preferes', TU_PREFERES_CONFIG),
    actionSchema: optionVoteActionSchema,
    contentRef: 'tu-preferes-core',
  }],
  ['gauche-ou-droite', {
    module: createOptionVote('gauche-ou-droite', GAUCHE_DROITE_CONFIG),
    actionSchema: optionVoteActionSchema,
    contentRef: 'gauche-ou-droite-core',
  }],
  ['quizz-culture-ge', {
    module: createInputGuess('quizz-culture-ge', QUIZZ_CULTURE_GE_CONFIG),
    actionSchema: inputGuessActionSchema,
    contentRef: 'quizz-culture-ge-core',
  }],
  ['cinquante-cinquante', {
    module: createInputGuess('cinquante-cinquante', CINQUANTE_CINQUANTE_CONFIG),
    actionSchema: inputGuessActionSchema,
    contentRef: 'cinquante-cinquante-core',
  }],
  ['double-jeu', {
    module: createSecretRole('double-jeu', DOUBLE_JEU_CONFIG),
    actionSchema: secretRoleActionSchema,
    contentRef: 'double-jeu-core',
  }],
  ['truth-or-dare-2', {
    module: createTruthDare('truth-or-dare-2', TRUTH_OR_DARE_2_CONFIG),
    actionSchema: truthDareActionSchema,
    contentRef: 'truth-or-dare-2-core',
  }],
  ['truth-or-drink', {
    module: createTruthDare('truth-or-drink', TRUTH_OR_DRINK_CONFIG),
    actionSchema: truthDareActionSchema,
    contentRef: 'truth-or-drink-core',
  }],
  ['jeu-de-la-note', {
    module: createSpotlightGuess('jeu-de-la-note', JEU_DE_LA_NOTE_CONFIG),
    actionSchema: spotlightGuessActionSchema,
    contentRef: 'jeu-de-la-note-core',
  }],
  ['devine-la-question', {
    module: createSpotlightGuess('devine-la-question', DEVINE_LA_QUESTION_CONFIG),
    actionSchema: spotlightGuessActionSchema,
    contentRef: 'devine-la-question-core',
  }],
  ['jeu-du-theme', {
    module: createLastStanding('jeu-du-theme', JEU_DU_THEME_CONFIG),
    actionSchema: lastStandingActionSchema,
    contentRef: 'jeu-du-theme-core',
  }],
  ['trouvez-la-regle', {
    module: createRuleHunt('trouvez-la-regle', TROUVEZ_LA_REGLE_CONFIG),
    actionSchema: ruleHuntActionSchema,
    contentRef: 'trouvez-la-regle-core',
  }],
  ['loup-garou', {
    module: createNightDay('loup-garou', LOUP_GAROU_CONFIG),
    actionSchema: nightDayActionSchema,
    contentRef: 'loup-garou-core',
  }],
  ['devine-l-action', {
    module: createPerformJudge('devine-l-action', DEVINE_L_ACTION_CONFIG),
    actionSchema: performJudgeActionSchema,
    contentRef: 'devine-l-action-core',
  }],
  ['devine-l-objet', {
    module: createPerformJudge('devine-l-objet', DEVINE_L_OBJET_CONFIG),
    actionSchema: performJudgeActionSchema,
    contentRef: 'devine-l-objet-core',
  }],
  ['mime-inverse', {
    module: createPerformJudge('mime-inverse', MIME_INVERSE_CONFIG),
    actionSchema: performJudgeActionSchema,
    contentRef: 'mime-inverse-core',
  }],
  ['double-le-mouvement', {
    module: createPerformJudge('double-le-mouvement', DOUBLE_LE_MOUVEMENT_CONFIG),
    actionSchema: performJudgeActionSchema,
    contentRef: 'double-le-mouvement-core',
  }],
  ['le-classement', {
    module: createRanking('le-classement', LE_CLASSEMENT_CONFIG),
    actionSchema: rankingActionSchema,
    contentRef: 'le-classement-core',
  }],
]);

export function lookupGame(gameId: string): GameEntry | null {
  return REGISTRY.get(gameId) ?? null;
}

/** Every registered entry — drives the generic CI audits (redaction I5; future schema audits). */
export function listGames(): ReadonlyArray<readonly [string, GameEntry]> {
  return [...REGISTRY.entries()];
}
