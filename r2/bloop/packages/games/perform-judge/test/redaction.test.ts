import { describe, expect, it } from 'vitest';
import { leakedSecrets } from '@bloop/engine';
import {
  createPerformJudge,
  DEVINE_L_ACTION_CONFIG,
  DEVINE_L_OBJET_CONFIG,
  DOUBLE_LE_MOUVEMENT_CONFIG,
  MIME_INVERSE_CONFIG,
  type PerformJudgeItem,
  type PerformJudgeState,
} from '@bloop/game-perform-judge';
import { act, deadline, fold, makeContent, others, rate, vote } from './fixtures.js';

const guided = createPerformJudge('devine-l-action', DEVINE_L_ACTION_CONFIG);
const credit = createPerformJudge('devine-l-objet', DEVINE_L_OBJET_CONFIG);
const puppet = createPerformJudge('mime-inverse', MIME_INVERSE_CONFIG);
const rateMod = createPerformJudge('double-le-mouvement', DOUBLE_LE_MOUVEMENT_CONFIG);

const P3 = ['p1', 'p2', 'p3'];
const P4 = ['p1', 'p2', 'p3', 'p4'];
const OUTSIDERS = ['spectator-x', '__proto__'];

function itemSecrets(item: PerformJudgeItem): Array<{ value: string }> {
  const out = [{ value: item.prompt.fr }, { value: item.prompt.en }];
  if (item.hint) out.push({ value: item.hint.fr }, { value: item.hint.en });
  if (item.forbidden) for (const w of [...item.forbidden.fr, ...item.forbidden.en]) out.push({ value: w });
  return out;
}

function current(state: PerformJudgeState): PerformJudgeItem {
  const item = state.offer[state.chosenIndex ?? 0];
  if (item === undefined) throw new Error('no current item');
  return item;
}

describe('guided (promptVisibility others): the PERFORMER is the redaction target', () => {
  it('the action + forbidden words never reach the performer or outsiders during ready/perform/judge', () => {
    let s = guided.init('s', P3, makeContent());
    const states: PerformJudgeState[] = [s];
    s = fold(guided, s, [deadline(0)]);
    states.push(s);
    s = fold(guided, s, [act(s.performer, { kind: 'claimDone' }, 1)]);
    states.push(s);
    for (const st of states) {
      expect(leakedSecrets(guided, st, [st.performer, ...OUTSIDERS], itemSecrets(current(st)))).toEqual([]);
    }
  });

  it('helpers DO see the secret in ready/perform/judge; the constraint card is on every phone', () => {
    let s = guided.init('s', P3, makeContent());
    const helper = others(s)[0]!;
    for (const viewer of [helper, s.performer, 'spectator-x']) {
      const v = guided.view(s, viewer);
      if (v.phase !== 'ready') throw new Error('expected ready');
      expect(v.constraint).not.toBeNull(); // public on every phone
      expect(v.secret !== null).toBe(viewer === helper);
    }
    s = fold(guided, s, [deadline(0)]);
    const pv = guided.view(s, s.performer);
    if (pv.phase !== 'perform') throw new Error('expected perform');
    expect(pv.secret).toBeNull();
    expect(pv.canClaimDone).toBe(true);
    const hv = guided.view(s, helper);
    if (hv.phase !== 'perform') throw new Error('expected perform');
    expect(hv.secret?.prompt).toEqual(current(s).prompt);
    expect(hv.secret?.forbidden).toEqual(current(s).forbidden);
  });

  it('the reveal finally shows the performer the action', () => {
    let s = guided.init('s', P3, makeContent());
    s = fold(guided, s, [deadline(0), deadline(1)]); // timeout fail
    const v = guided.view(s, s.performer);
    if (v.phase !== 'reveal') throw new Error('expected reveal');
    expect(v.result.item?.prompt).toEqual(current(s).prompt);
  });
});

describe('puppet: same inversion + structural map hygiene', () => {
  it('the puppet and unknown viewers never see the secret; commanders do', () => {
    const s = puppet.init('s', P3, makeContent());
    expect(leakedSecrets(puppet, s, [s.performer, ...OUTSIDERS], itemSecrets(current(s)))).toEqual([]);
    const cv = puppet.view(s, others(s)[0]!);
    if (cv.phase !== 'perform') throw new Error('expected perform');
    expect(cv.secret?.prompt).toEqual(current(s).prompt);
    const pv = puppet.view(s, s.performer);
    if (pv.phase !== 'perform') throw new Error('expected perform');
    expect(pv.secret).toBeNull();
    expect(pv.categoryHint).toEqual(current(s).category); // showCategoryToSpotlight
  });

  it('no taps/votes/stars/deck maps ever serialize into a mid-judge view', () => {
    const P5 = ['p1', 'p2', 'p3', 'p4', 'p5'];
    let s = puppet.init('s', P5, makeContent());
    const cs = others(s); // 4 commanders — one tap + one vote leaves the verdict open
    s = fold(puppet, s, [act(cs[0]!, { kind: 'tap' }, 1), deadline(2), vote(cs[1]!, 'no', 3)]);
    expect(s.phase).toBe('judge');
    for (const viewer of [...P5, ...OUTSIDERS]) {
      const json = JSON.stringify(puppet.view(s, viewer));
      for (const field of ['"taps"', '"votes"', '"stars"', '"deck"', '"cursor"', '"offer"', '"chosenIndex"']) {
        expect(json).not.toContain(field);
      }
    }
  });

  it('tap counts are public; WHO tapped is only the owner echo', () => {
    let s = puppet.init('s', P3, makeContent());
    const [c1, c2] = others(s) as [string, string];
    s = fold(puppet, s, [act(c1, { kind: 'tap' }, 1)]);
    const v1 = puppet.view(s, c1);
    const v2 = puppet.view(s, c2);
    if (v1.phase !== 'perform' || v2.phase !== 'perform') throw new Error('expected perform');
    expect(v1.tapCount).toBe(1);
    expect(v1.myTapped).toBe(true);
    expect(v2.tapCount).toBe(1);
    expect(v2.myTapped).toBe(false);
  });
});

describe('credit (promptVisibility performer): the ROOM is the redaction target', () => {
  it('the object never reaches helpers or outsiders during mime; the category chip is public', () => {
    let s = credit.init('s', P3, makeContent());
    s = fold(credit, s, [deadline(0)]);
    const viewers = [...others(s), ...OUTSIDERS];
    expect(leakedSecrets(credit, s, viewers, itemSecrets(current(s)))).toEqual([]);
    const pv = credit.view(s, s.performer);
    if (pv.phase !== 'perform') throw new Error('expected perform');
    expect(pv.secret?.prompt).toEqual(current(s).prompt);
    expect(pv.claimTargets).toEqual(others(s));
    const hv = credit.view(s, others(s)[0]!);
    if (hv.phase !== 'perform') throw new Error('expected perform');
    expect(hv.secret).toBeNull();
    expect(hv.categoryHint).toEqual(current(s).category);
  });

  it('the validate phase puts the object on the table for ALL viewers', () => {
    let s = credit.init('s', P3, makeContent());
    s = fold(credit, s, [deadline(0)]);
    s = fold(credit, s, [act(s.performer, { kind: 'claimFound', guesser: others(s)[0]! }, 1)]);
    for (const viewer of [...P3, ...OUTSIDERS]) {
      const v = credit.view(s, viewer);
      if (v.phase !== 'judge') throw new Error('expected judge');
      expect(v.publicItem?.prompt).toEqual(current(s).prompt);
    }
  });
});

describe('rate: prompt data is mover-only until the reveal', () => {
  function start() {
    return rateMod.init('s', P4, makeContent());
  }

  it('brief: the mover sees the 2-prompt offer; dubber/audience/outsiders see nothing', () => {
    const s = start();
    const offerSecrets = s.offer.flatMap(itemSecrets);
    expect(offerSecrets.length).toBeGreaterThan(0);
    const blind = [s.partner!, ...P4.filter((p) => p !== s.performer && p !== s.partner), ...OUTSIDERS];
    expect(leakedSecrets(rateMod, s, blind, offerSecrets)).toEqual([]);
    const mv = rateMod.view(s, s.performer);
    if (mv.phase !== 'ready') throw new Error('expected ready');
    expect(mv.offers).toHaveLength(2);
  });

  it('perform: only the mover holds the chosen prompt; rate: NOBODY does (suspense card)', () => {
    let s = fold(rateMod, start(), [deadline(0)]);
    const blind = [s.partner!, ...P4.filter((p) => p !== s.performer && p !== s.partner), ...OUTSIDERS];
    expect(leakedSecrets(rateMod, s, blind, s.offer.flatMap(itemSecrets))).toEqual([]);
    const mv = rateMod.view(s, s.performer);
    if (mv.phase !== 'perform') throw new Error('expected perform');
    expect(mv.secret?.prompt).toEqual(current(s).prompt);
    s = fold(rateMod, s, [deadline(1)]); // judge
    expect(leakedSecrets(rateMod, s, [...P4, ...OUTSIDERS], s.offer.flatMap(itemSecrets))).toEqual([]);
  });

  it('reveal publishes the CHOSEN prompt only — the unpicked offer stays secret forever', () => {
    let s = start();
    s = fold(rateMod, s, [act(s.performer, { kind: 'pick', index: 1 }, 1), deadline(2), deadline(3)]);
    expect(s.phase).toBe('reveal');
    const unpicked = s.offer[0]!;
    expect(leakedSecrets(rateMod, s, [...P4, ...OUTSIDERS], itemSecrets(unpicked))).toEqual([]);
    const v = rateMod.view(s, OUTSIDERS[1]!);
    if (v.phase !== 'reveal') throw new Error('expected reveal');
    expect(v.result.item?.prompt).toEqual(s.offer[1]!.prompt);
  });

  it('star ballots: counts public, values owner-echo only; non-actor views invariant', () => {
    let s = fold(rateMod, start(), [deadline(0), deadline(1)]);
    const raters = P4.filter((p) => p !== s.performer && p !== s.partner);
    const sLow = fold(rateMod, s, [rate(raters[0]!, 1, 2)]);
    const sHigh = fold(rateMod, s, [rate(raters[0]!, 5, 2)]);
    expect(rateMod.phaseKey(sLow)).toBe(rateMod.phaseKey(sHigh));
    const va = rateMod.view(sLow, raters[0]!);
    const vb = rateMod.view(sHigh, raters[0]!);
    if (va.phase !== 'judge' || vb.phase !== 'judge') throw new Error('expected judge');
    expect(va.myStars).toBe(1);
    expect(vb.myStars).toBe(5);
    for (const viewer of [s.performer, s.partner!, raters[1]!, ...OUTSIDERS]) {
      expect(rateMod.view(sLow, viewer)).toEqual(rateMod.view(sHigh, viewer));
    }
  });
});

describe('verdict ballots are invariant for non-actors', () => {
  it('guided: a yes vs no vote changes only the voter own echo', () => {
    let s = guided.init('s', P3, makeContent());
    s = fold(guided, s, [deadline(0), act(s.performer, { kind: 'claimDone' }, 1)]);
    const [h1, h2] = others(s) as [string, string];
    const sYes = fold(guided, s, [vote(h1, 'yes', 2)]);
    const sNo = fold(guided, s, [vote(h1, 'no', 2)]);
    expect(guided.phaseKey(sYes)).toBe(guided.phaseKey(sNo));
    for (const viewer of [s.performer, h2, ...OUTSIDERS]) {
      expect(guided.view(sYes, viewer)).toEqual(guided.view(sNo, viewer));
    }
    const own = guided.view(sYes, h1);
    if (own.phase !== 'judge') throw new Error('expected judge');
    expect(own.myVote).toBe('yes');
  });
});

describe('undrawn deck items never leak anywhere, any phase', () => {
  it('walks a full guided game checking the next undrawn item against every viewer', () => {
    let s = guided.init('s', P3, makeContent(12));
    for (let i = 0; i < 30 && s.phase !== 'over'; i++) {
      const next = s.deck[s.cursor];
      if (next !== undefined) {
        expect(leakedSecrets(guided, s, [...P3, ...OUTSIDERS], itemSecrets(next))).toEqual([]);
      }
      s = guided.reduce(s, deadline(1_000 + i)).state;
    }
  });
});

describe('hostile / unknown viewers', () => {
  it('every phase view is JSON-serializable and non-crashing for roster, spectator and __proto__', () => {
    for (const [module, players] of [
      [guided, P3], [credit, P3], [puppet, P3], [rateMod, P4],
    ] as const) {
      let s = module.init('s', [...players], makeContent(40));
      for (let i = 0; i < 40; i++) {
        for (const viewer of [...players, ...OUTSIDERS]) {
          const v = module.view(s, viewer);
          expect(JSON.parse(JSON.stringify(v))).toEqual(v);
        }
        if (s.phase === 'over') break;
        s = module.reduce(s, deadline(2_000 + i)).state;
      }
      expect(s.phase).toBe('over');
    }
  });

  it('an unknown viewer gets the spotlight-redacted view in others-visibility modes', () => {
    const s = puppet.init('s', P3, makeContent());
    const unknown = puppet.view(s, 'second-device-of-the-puppet');
    const spotlight = puppet.view(s, s.performer);
    if (unknown.phase !== 'perform' || spotlight.phase !== 'perform') throw new Error('expected perform');
    expect(unknown.secret).toBeNull();
    expect(JSON.stringify(unknown)).not.toContain('secret-prompt');
    expect(spotlight.secret).toBeNull();
  });
});
