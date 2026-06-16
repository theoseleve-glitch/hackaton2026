import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import type { ContentPack } from '@bloop/engine';
import {
  createWhoSaidThat,
  whoSaidThat,
  whoSaidThatActionSchema,
  type LText,
  type WhoSaidThatContent,
} from '@bloop/game-who-said-that';

const players = ['p1', 'p2', 'p3', 'p4'];

interface PackItem {
  id: string;
  text: LText;
  spicy: number;
  tags: string[];
}
interface RawPack {
  gameId: string;
  version: number;
  items: PackItem[];
}

const packPath = fileURLToPath(
  new URL('../../../../content/packs/qui-a-dit-ca.json', import.meta.url),
);
const rawPack = JSON.parse(readFileSync(packPath, 'utf8')) as RawPack;

describe('who-said-that factory + config', () => {
  it('the default module has the expected id and player floor/ceiling', () => {
    expect(whoSaidThat.id).toBe('qui-a-dit-ca');
    expect(whoSaidThat.version).toBe(1);
    expect(whoSaidThat.minPlayers).toBe(4); // attribution needs a crowd
    expect(whoSaidThat.maxPlayers).toBe(10);
  });

  it('createWhoSaidThat stamps the given id and merges config', () => {
    const mod = createWhoSaidThat('custom-id', { totalRounds: 9, ghostBonus: 2 });
    const content: ContentPack<WhoSaidThatContent> = {
      id: 'c', version: 1, data: { statements: Array.from({ length: 12 }, (_, i) => `S${i}`) },
    };
    const s0 = mod.init('seed', players, content);
    expect(mod.id).toBe('custom-id');
    expect(s0.config.totalRounds).toBe(9);
    expect(s0.config.ghostBonus).toBe(2);
  });
});

describe('who-said-that action schema', () => {
  it('accepts a confess action', () => {
    expect(whoSaidThatActionSchema.safeParse({ kind: 'confess', value: true }).success).toBe(true);
    expect(whoSaidThatActionSchema.safeParse({ kind: 'confess', value: false }).success).toBe(true);
  });
  it('accepts an accuse action with a target', () => {
    expect(whoSaidThatActionSchema.safeParse({ kind: 'accuse', target: 'p2' }).success).toBe(true);
  });
  it('rejects malformed actions (missing value / target / unknown kind / free text)', () => {
    expect(whoSaidThatActionSchema.safeParse({ kind: 'confess' }).success).toBe(false);
    expect(whoSaidThatActionSchema.safeParse({ kind: 'accuse' }).success).toBe(false);
    expect(whoSaidThatActionSchema.safeParse({ kind: 'shout', text: 'hi' }).success).toBe(false);
    expect(whoSaidThatActionSchema.safeParse({ kind: 'confess', value: 'yes' }).success).toBe(false);
  });
});

describe('qui-a-dit-ca content pack', () => {
  it('declares the correct gameId', () => {
    expect(rawPack.gameId).toBe('qui-a-dit-ca');
  });

  it('ships ~45 core statements, all spicy 0, all bilingual non-empty', () => {
    expect(rawPack.items.length).toBeGreaterThanOrEqual(45);
    for (const item of rawPack.items) {
      expect(item.spicy).toBe(0); // build ships spicy-0 only
      expect(item.text.fr.length).toBeGreaterThan(0);
      expect(item.text.en.length).toBeGreaterThan(0);
      expect(item.id).toMatch(/^qadc-/);
    }
  });

  it('has unique item ids', () => {
    const ids = rawPack.items.map((i) => i.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it('drives the module end-to-end with bilingual statements passed through AS-IS', () => {
    const content: ContentPack<WhoSaidThatContent> = {
      id: `${rawPack.gameId}-core`,
      version: rawPack.version,
      data: { statements: rawPack.items.map((i) => i.text) },
    };
    const s0 = whoSaidThat.init('seed', players, content);
    const v = whoSaidThat.view(s0, 'p1');
    if (v.phase !== 'confess') throw new Error('expected confess view');
    // The statement is a bilingual object, passed through untouched.
    expect(typeof v.statement).toBe('object');
    expect((v.statement as LText).fr.length).toBeGreaterThan(0);
  });
});

describe('who-said-that epilogue (over view)', () => {
  it('derives a cliffhanger from the public final scores only', () => {
    const content: ContentPack<WhoSaidThatContent> = {
      id: 'c', version: 1, data: { statements: ['S1', 'S2'] },
    };
    let s = whoSaidThat.init('seed', players, content);
    // Walk to over by deadlines (zero-confess rounds => flat 0 scores => contested crown).
    for (let i = 0; i < s.config.totalRounds; i++) {
      s = whoSaidThat.reduce(s, { type: 'deadline', at: 0 }).state;
      s = whoSaidThat.reduce(s, { type: 'deadline', at: 1 }).state;
      s = whoSaidThat.reduce(s, { type: 'deadline', at: 2 }).state;
    }
    const v = whoSaidThat.view(s, 'p1');
    if (v.phase !== 'over') throw new Error('expected over view');
    expect(v.cliffhanger.mvp).toBeNull(); // a flat tie has no single MVP
    expect(v.cliffhanger.topGap).toBe(0);
    expect(v.cliffhanger.closeFinish).toBe(true);
  });
});
