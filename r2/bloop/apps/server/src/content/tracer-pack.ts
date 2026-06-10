import type { ContentPack } from '@bloop/engine';
import type { TracerContent } from '@bloop/game-tracer';

/**
 * STATIC built-in content (2c). R2 seam (design §1.2): packs later live in the
 * CONTENT bucket as `<gameId>/<contentId>@<version>.json` and load through the
 * registry; RoomMeta.contentRef already records exactly which pack a running
 * game was init'd with, so rehydration stays deterministic across that change.
 */
export const TRACER_PACK: ContentPack<TracerContent> = {
  id: 'tracer-core',
  version: 1,
  data: {
    prompts: [
      'Most likely to befriend the bartender within ten minutes',
      'Most likely to cry at a phone commercial',
      'Most likely to survive a zombie apocalypse out of spite',
      'Most likely to text back three business days later',
      'Most likely to win an argument with a GPS',
      'Most likely to bring a spreadsheet to a picnic',
    ],
  },
};
