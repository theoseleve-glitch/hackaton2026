import type { ContentPack, GameModule } from '@bloop/engine';
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
import { CINQUANTE_CINQUANTE_PACK, QUIZZ_CULTURE_GE_PACK } from '../content/input-guess-packs.js';
import { JEU_DU_THEME_PACK } from '../content/last-standing-pack.js';
import { LOUP_GAROU_PACK } from '../content/night-day-pack.js';
import {
  DEVINE_L_ACTION_PACK,
  DEVINE_L_OBJET_PACK,
  DOUBLE_LE_MOUVEMENT_PACK,
  MIME_INVERSE_PACK,
} from '../content/perform-judge-packs.js';
import { DOUBLE_JEU_PACK } from '../content/secret-role-pack.js';
import { GAUCHE_DROITE_PACK, TU_PREFERES_PACK } from '../content/option-vote-packs.js';
import { PIRES_POTES_PACK } from '../content/pires-potes-pack.js';
import { TROUVEZ_LA_REGLE_PACK } from '../content/rule-hunt-packs.js';
import { DEVINE_LA_QUESTION_PACK, JEU_DE_LA_NOTE_PACK } from '../content/spotlight-guess-packs.js';
import { TRACER_PACK } from '../content/tracer-pack.js';
import { TRUTH_OR_DARE_2_PACK, TRUTH_OR_DRINK_PACK } from '../content/truth-dare-packs.js';

// The registry erases per-game generics; type safety is restored per game by
// the zod schema at the boundary and by the module's own typed tests.
export type AnyGameModule = GameModule<any, any, any, any>;

export interface GameEntry {
  module: AnyGameModule;
  /** Validates client `action.payload` — the protocol leaves it z.unknown() on purpose. */
  actionSchema: z.ZodType<any>;
  /** 2c: static built-in pack. R2 seam: becomes an async loader keyed by RoomMeta.contentRef. */
  content: ContentPack<any>;
}

/** A Map, NOT an object literal: gameId is CLIENT-SUPPLIED — `obj['__proto__']` on a literal would return Object.prototype. */
const REGISTRY = new Map<string, GameEntry>([
  ['tracer', { module: tracer, actionSchema: tracerActionSchema, content: TRACER_PACK }],
  ['pires-potes', {
    module: createTracer('pires-potes', PIRES_POTES_CONFIG),
    actionSchema: tracerActionSchema,
    content: PIRES_POTES_PACK,
  }],
  ['tu-preferes', {
    module: createOptionVote('tu-preferes', TU_PREFERES_CONFIG),
    actionSchema: optionVoteActionSchema,
    content: TU_PREFERES_PACK,
  }],
  ['gauche-ou-droite', {
    module: createOptionVote('gauche-ou-droite', GAUCHE_DROITE_CONFIG),
    actionSchema: optionVoteActionSchema,
    content: GAUCHE_DROITE_PACK,
  }],
  ['quizz-culture-ge', {
    module: createInputGuess('quizz-culture-ge', QUIZZ_CULTURE_GE_CONFIG),
    actionSchema: inputGuessActionSchema,
    content: QUIZZ_CULTURE_GE_PACK,
  }],
  ['cinquante-cinquante', {
    module: createInputGuess('cinquante-cinquante', CINQUANTE_CINQUANTE_CONFIG),
    actionSchema: inputGuessActionSchema,
    content: CINQUANTE_CINQUANTE_PACK,
  }],
  ['double-jeu', {
    module: createSecretRole('double-jeu', DOUBLE_JEU_CONFIG),
    actionSchema: secretRoleActionSchema,
    content: DOUBLE_JEU_PACK,
  }],
  ['truth-or-dare-2', {
    module: createTruthDare('truth-or-dare-2', TRUTH_OR_DARE_2_CONFIG),
    actionSchema: truthDareActionSchema,
    content: TRUTH_OR_DARE_2_PACK,
  }],
  ['truth-or-drink', {
    module: createTruthDare('truth-or-drink', TRUTH_OR_DRINK_CONFIG),
    actionSchema: truthDareActionSchema,
    content: TRUTH_OR_DRINK_PACK,
  }],
  ['jeu-de-la-note', {
    module: createSpotlightGuess('jeu-de-la-note', JEU_DE_LA_NOTE_CONFIG),
    actionSchema: spotlightGuessActionSchema,
    content: JEU_DE_LA_NOTE_PACK,
  }],
  ['devine-la-question', {
    module: createSpotlightGuess('devine-la-question', DEVINE_LA_QUESTION_CONFIG),
    actionSchema: spotlightGuessActionSchema,
    content: DEVINE_LA_QUESTION_PACK,
  }],
  ['jeu-du-theme', {
    module: createLastStanding('jeu-du-theme', JEU_DU_THEME_CONFIG),
    actionSchema: lastStandingActionSchema,
    content: JEU_DU_THEME_PACK,
  }],
  ['trouvez-la-regle', {
    module: createRuleHunt('trouvez-la-regle', TROUVEZ_LA_REGLE_CONFIG),
    actionSchema: ruleHuntActionSchema,
    content: TROUVEZ_LA_REGLE_PACK,
  }],
  ['loup-garou', {
    module: createNightDay('loup-garou', LOUP_GAROU_CONFIG),
    actionSchema: nightDayActionSchema,
    content: LOUP_GAROU_PACK,
  }],
  ['devine-l-action', {
    module: createPerformJudge('devine-l-action', DEVINE_L_ACTION_CONFIG),
    actionSchema: performJudgeActionSchema,
    content: DEVINE_L_ACTION_PACK,
  }],
  ['devine-l-objet', {
    module: createPerformJudge('devine-l-objet', DEVINE_L_OBJET_CONFIG),
    actionSchema: performJudgeActionSchema,
    content: DEVINE_L_OBJET_PACK,
  }],
  ['mime-inverse', {
    module: createPerformJudge('mime-inverse', MIME_INVERSE_CONFIG),
    actionSchema: performJudgeActionSchema,
    content: MIME_INVERSE_PACK,
  }],
  ['double-le-mouvement', {
    module: createPerformJudge('double-le-mouvement', DOUBLE_LE_MOUVEMENT_CONFIG),
    actionSchema: performJudgeActionSchema,
    content: DOUBLE_LE_MOUVEMENT_PACK,
  }],
]);

export function lookupGame(gameId: string): GameEntry | null {
  return REGISTRY.get(gameId) ?? null;
}

/** Every registered entry — drives the generic CI audits (redaction I5; future schema audits). */
export function listGames(): ReadonlyArray<readonly [string, GameEntry]> {
  return [...REGISTRY.entries()];
}
