import type { ContentPack } from '@bloop/engine';
import { CINQUANTE_CINQUANTE_PACK, QUIZZ_CULTURE_GE_PACK } from './input-guess-packs.js';
import { JEU_DU_THEME_PACK } from './last-standing-pack.js';
import { LOUP_GAROU_PACK } from './night-day-pack.js';
import { GAUCHE_DROITE_PACK, TU_PREFERES_PACK } from './option-vote-packs.js';
import {
  DEVINE_L_ACTION_PACK,
  DEVINE_L_OBJET_PACK,
  DOUBLE_LE_MOUVEMENT_PACK,
  MIME_INVERSE_PACK,
} from './perform-judge-packs.js';
import { PIRES_POTES_PACK } from './pires-potes-pack.js';
import { LE_CLASSEMENT_PACK } from './ranking-pack.js';
import { TROUVEZ_LA_REGLE_PACK } from './rule-hunt-packs.js';
import { DOUBLE_JEU_PACK } from './secret-role-pack.js';
import { DEVINE_LA_QUESTION_PACK, JEU_DE_LA_NOTE_PACK } from './spotlight-guess-packs.js';
import { TRACER_PACK } from './tracer-pack.js';
import { TRUTH_OR_DARE_2_PACK, TRUTH_OR_DRINK_PACK } from './truth-dare-packs.js';

/**
 * R2 content SEED module. This file imports EVERY content pack — it is the one
 * place that pulls the heavy pack consts into a bundle. It is therefore imported
 * ONLY by tests (test/setup-content.ts) and the dev/prod seed script
 * (scripts/seed-r2.mjs), NEVER by registry.ts or the worker entry, so the packs
 * stay out of the deployed worker bundle (the whole point of the R2 seam).
 */
export const ALL_PACKS: ContentPack<any>[] = [
  TRACER_PACK,
  PIRES_POTES_PACK,
  TU_PREFERES_PACK,
  GAUCHE_DROITE_PACK,
  QUIZZ_CULTURE_GE_PACK,
  CINQUANTE_CINQUANTE_PACK,
  DOUBLE_JEU_PACK,
  TRUTH_OR_DARE_2_PACK,
  TRUTH_OR_DRINK_PACK,
  JEU_DE_LA_NOTE_PACK,
  DEVINE_LA_QUESTION_PACK,
  JEU_DU_THEME_PACK,
  TROUVEZ_LA_REGLE_PACK,
  LOUP_GAROU_PACK,
  DEVINE_L_ACTION_PACK,
  DEVINE_L_OBJET_PACK,
  MIME_INVERSE_PACK,
  DOUBLE_LE_MOUVEMENT_PACK,
  LE_CLASSEMENT_PACK,
];

/** Resolve a pack by its R2 key (= contentRef = pack.id). Used by node tests that need the live pack object. */
export function packForRef(contentRef: string): ContentPack<any> | undefined {
  return ALL_PACKS.find((pack) => pack.id === contentRef);
}

/** Seed every pack into the CONTENT bucket under its own id. Idempotent: R2 keys are immutable per id. */
export async function seedContent(bucket: R2Bucket): Promise<void> {
  for (const pack of ALL_PACKS) {
    await bucket.put(pack.id, JSON.stringify(pack));
  }
}
