// T096 — drip-cycle handler tests. T104 already shipped the pure
// scheduling primitive (`decideDripStage`); this layer wraps it with
// per-contact email dispatch + stage-increment idempotency. The
// handler is a pure function over four injected callbacks
// (sendEmail, updateContactStage, getUnsubUrl, plus the contact
// list and now); the Cloudflare-Pages scheduled handler in
// functions/_scheduled/waitlist-drip.ts wires those callbacks to
// real Resend API calls. Splitting it this way keeps the loop's
// decision logic testable here while the deploy-only piece (cron
// firing, Resend audience pagination) lands when T008 unblocks.

import { describe, expect, test, vi, type Mock } from 'vitest';
import {
  runDripCycle,
  type ContactState,
  type SendEmailFn,
  type UpdateContactStageFn,
  type GetUnsubUrlFn,
} from '../../functions/_lib/waitlist-drip/handler';
import { SUBJECT as SUBJECT_1 } from '../../functions/_lib/waitlist-drip/email-1';
import { SUBJECT as SUBJECT_2 } from '../../functions/_lib/waitlist-drip/email-2';
import { SUBJECT as SUBJECT_3 } from '../../functions/_lib/waitlist-drip/email-3';

const NOW = new Date('2026-04-30T14:00:00Z');
const D1_AGO = new Date('2026-04-29T14:00:00Z');
const D7_AGO = new Date('2026-04-23T14:00:00Z');
const D14_AGO = new Date('2026-04-16T14:00:00Z');
const HALF_DAY_AGO = new Date('2026-04-30T02:00:00Z');

const makeContact = (overrides: Partial<ContactState> = {}): ContactState => ({
  email: 'driver@example.com',
  confirmedAt: D1_AGO,
  dripStage: 0,
  unsubscribed: false,
  ...overrides,
});

interface Mocks {
  sendEmail: Mock<SendEmailFn>;
  updateContactStage: Mock<UpdateContactStageFn>;
  getUnsubUrl: Mock<GetUnsubUrlFn>;
}

const makeMocks = (): Mocks => ({
  sendEmail: vi.fn<SendEmailFn>(async () => undefined),
  updateContactStage: vi.fn<UpdateContactStageFn>(async () => undefined),
  getUnsubUrl: vi.fn<GetUnsubUrlFn>(
    async (email: string) =>
      `https://lap-coach.racing/api/waitlist/unsubscribe?email=${email}`,
  ),
});

describe('T096: runDripCycle dispatches per stage threshold', () => {
  test('sends email 1 to d1+ contact at stage 0 and bumps stage to 1', async () => {
    const contacts = [makeContact({})];
    const mocks = makeMocks();

    const summary = await runDripCycle({ contacts, now: NOW, ...mocks });

    expect(mocks.sendEmail).toHaveBeenCalledTimes(1);
    const call = mocks.sendEmail.mock.calls[0][0];
    expect(call.subject).toBe(SUBJECT_1);
    expect(call.to).toBe('driver@example.com');
    expect(typeof call.html).toBe('string');
    expect(typeof call.text).toBe('string');
    expect(mocks.updateContactStage).toHaveBeenCalledWith({
      email: 'driver@example.com',
      newStage: 1,
    });
    expect(summary).toEqual({ examined: 1, sent: 1, errors: [] });
  });

  test('sends email 2 to d7+ contact at stage 1 and bumps stage to 2', async () => {
    const contacts = [makeContact({ confirmedAt: D7_AGO, dripStage: 1 })];
    const mocks = makeMocks();

    await runDripCycle({ contacts, now: NOW, ...mocks });

    expect(mocks.sendEmail.mock.calls[0][0].subject).toBe(SUBJECT_2);
    expect(mocks.updateContactStage).toHaveBeenCalledWith({
      email: 'driver@example.com',
      newStage: 2,
    });
  });

  test('sends email 3 to d14+ contact at stage 2 and bumps stage to 3', async () => {
    const contacts = [makeContact({ confirmedAt: D14_AGO, dripStage: 2 })];
    const mocks = makeMocks();

    await runDripCycle({ contacts, now: NOW, ...mocks });

    expect(mocks.sendEmail.mock.calls[0][0].subject).toBe(SUBJECT_3);
    expect(mocks.updateContactStage).toHaveBeenCalledWith({
      email: 'driver@example.com',
      newStage: 3,
    });
  });
});

describe('T096: runDripCycle skip rules', () => {
  test('skips contact already at stage 3 (drip complete)', async () => {
    const contacts = [makeContact({ confirmedAt: D14_AGO, dripStage: 3 })];
    const mocks = makeMocks();

    const summary = await runDripCycle({ contacts, now: NOW, ...mocks });

    expect(mocks.sendEmail).not.toHaveBeenCalled();
    expect(mocks.updateContactStage).not.toHaveBeenCalled();
    expect(summary.sent).toBe(0);
  });

  test('skips unsubscribed contact regardless of stage', async () => {
    const contacts = [makeContact({ unsubscribed: true })];
    const mocks = makeMocks();

    const summary = await runDripCycle({ contacts, now: NOW, ...mocks });

    expect(mocks.sendEmail).not.toHaveBeenCalled();
    expect(mocks.updateContactStage).not.toHaveBeenCalled();
    expect(summary.sent).toBe(0);
  });

  test('skips contact whose threshold has not yet been reached', async () => {
    // 12 hours since confirm at stage 0 → d1 not yet reached → skip
    const contacts = [makeContact({ confirmedAt: HALF_DAY_AGO })];
    const mocks = makeMocks();

    const summary = await runDripCycle({ contacts, now: NOW, ...mocks });

    expect(mocks.sendEmail).not.toHaveBeenCalled();
    expect(summary.sent).toBe(0);
  });
});

describe('T096: runDripCycle email body wiring', () => {
  test('embedded unsubscribe URL appears in both html and text bodies', async () => {
    const contacts = [makeContact({})];
    const mocks = makeMocks();

    await runDripCycle({ contacts, now: NOW, ...mocks });

    const call = mocks.sendEmail.mock.calls[0][0];
    const expectedUrl =
      'https://lap-coach.racing/api/waitlist/unsubscribe?email=driver@example.com';
    expect(call.text).toContain(expectedUrl);
    expect(call.html).toContain(expectedUrl);
  });

  test('per-contact unsubscribe URLs (getUnsubUrl called once per recipient)', async () => {
    // Two recipients, two distinct URLs minted — proves the
    // unsub-token mint isn't shared across contacts (each contact
    // gets a token bound to their own email).
    const contacts = [
      makeContact({ email: 'first@example.com' }),
      makeContact({ email: 'second@example.com' }),
    ];
    const mocks = makeMocks();

    await runDripCycle({ contacts, now: NOW, ...mocks });

    expect(mocks.getUnsubUrl).toHaveBeenCalledTimes(2);
    expect(mocks.getUnsubUrl).toHaveBeenNthCalledWith(1, 'first@example.com');
    expect(mocks.getUnsubUrl).toHaveBeenNthCalledWith(2, 'second@example.com');
  });
});

describe('T096: runDripCycle error handling per contact', () => {
  test('sendEmail rejection captured per-contact, loop continues to next', async () => {
    const contacts = [
      makeContact({ email: 'first@example.com' }),
      makeContact({ email: 'second@example.com' }),
    ];
    const mocks = makeMocks();
    mocks.sendEmail.mockImplementationOnce(() =>
      Promise.reject(new Error('Resend 502')),
    );

    const summary = await runDripCycle({ contacts, now: NOW, ...mocks });

    expect(summary.examined).toBe(2);
    expect(summary.sent).toBe(1);
    expect(summary.errors).toHaveLength(1);
    expect(summary.errors[0]).toEqual({
      email: 'first@example.com',
      reason: 'Resend 502',
    });
    // updateContactStage NOT called for the failed send (no false bump)
    expect(mocks.updateContactStage).toHaveBeenCalledTimes(1);
    expect(mocks.updateContactStage).toHaveBeenCalledWith({
      email: 'second@example.com',
      newStage: 1,
    });
  });

  test('updateContactStage rejection captured, no double-attribution to sent count', async () => {
    // If the email send succeeds but the stage-update fails, the
    // contact will get the same email again next run. Surface the
    // error in the summary so ops can investigate; don't crash the
    // whole cron.
    const contacts = [makeContact({ email: 'driver@example.com' })];
    const mocks = makeMocks();
    mocks.updateContactStage.mockImplementationOnce(() =>
      Promise.reject(new Error('audience PATCH 500')),
    );

    const summary = await runDripCycle({ contacts, now: NOW, ...mocks });

    expect(summary.errors).toHaveLength(1);
    expect(summary.errors[0].email).toBe('driver@example.com');
    expect(summary.errors[0].reason).toBe('audience PATCH 500');
  });
});

describe('T096: runDripCycle idempotency under stage advancement', () => {
  test('second cycle on the same day with already-advanced stage does not re-send', async () => {
    // Simulates: cron runs at 14:00 UTC, sends email 1, bumps stage to 1.
    // Same cron retries 5 minutes later (network blip) — should NOT
    // re-send, because the contact is now at stage 1 with d1 days
    // since confirmation (d7 not yet reached for email 2).
    let contact = makeContact({ confirmedAt: D1_AGO, dripStage: 0 });
    const mocks = makeMocks();
    mocks.updateContactStage.mockImplementation(async ({ newStage }) => {
      contact = { ...contact, dripStage: newStage };
    });

    await runDripCycle({ contacts: [contact], now: NOW, ...mocks });
    expect(mocks.sendEmail).toHaveBeenCalledTimes(1);

    await runDripCycle({ contacts: [contact], now: NOW, ...mocks });
    // No second send on retry: stage bumped to 1, d1 already met,
    // d7 not — so decideDripStage returns null.
    expect(mocks.sendEmail).toHaveBeenCalledTimes(1);
  });
});

describe('T096: drip-stage encoder/decoder round-trip', () => {
  // The Cloudflare wrapper carries drip_stage on the Resend
  // contact's `first_name` field as `"drip:N"`. Lock the
  // encode/decode pair so a future swap of the carrier (e.g., to
  // Resend custom fields when available, or to a KV namespace)
  // keeps the round-trip semantics intact.
  test('encodeDripStage(N) round-trips through parseDripStage', async () => {
    const { __test } = await import(
      '../../functions/_scheduled/waitlist-drip'
    );
    for (const stage of [0, 1, 2, 3] as const) {
      expect(__test.parseDripStage(__test.encodeDripStage(stage))).toBe(stage);
    }
  });

  test('parseDripStage falls back to 0 on null / empty / unprefixed / out-of-range', async () => {
    const { __test } = await import(
      '../../functions/_scheduled/waitlist-drip'
    );
    expect(__test.parseDripStage(null)).toBe(0);
    expect(__test.parseDripStage(undefined)).toBe(0);
    expect(__test.parseDripStage('')).toBe(0);
    // Real first_name values from contacts who pre-date the drip
    // wiring fall through cleanly — they get treated as stage 0,
    // which is correct (they have not received any drip yet).
    expect(__test.parseDripStage('Theo')).toBe(0);
    expect(__test.parseDripStage('Anonymous Driver')).toBe(0);
    // Out-of-range encodings are clamped to 0 rather than trusted —
    // a stale or hand-edited value should not skip the drip.
    expect(__test.parseDripStage('drip:-1')).toBe(0);
    expect(__test.parseDripStage('drip:4')).toBe(0);
    expect(__test.parseDripStage('drip:NaN')).toBe(0);
    expect(__test.parseDripStage('drip:')).toBe(0);
  });
});

describe('T096: runDripCycle summary semantics', () => {
  test('examined counts every contact including skipped ones', async () => {
    const contacts = [
      makeContact({ email: 'send@example.com' }),
      makeContact({ email: 'skip-stage@example.com', dripStage: 3 }),
      makeContact({ email: 'skip-unsub@example.com', unsubscribed: true }),
    ];
    const mocks = makeMocks();

    const summary = await runDripCycle({ contacts, now: NOW, ...mocks });

    expect(summary.examined).toBe(3);
    expect(summary.sent).toBe(1);
    expect(summary.errors).toHaveLength(0);
  });

  test('mixed three stages dispatch the correct three emails in order', async () => {
    // Three contacts at three different stages — confirms the
    // stage→email-module mapping isn't crossed (e.g., email 2
    // accidentally going to stage 0 contacts).
    const contacts = [
      makeContact({ email: 'a@x.com', confirmedAt: D1_AGO, dripStage: 0 }),
      makeContact({ email: 'b@x.com', confirmedAt: D7_AGO, dripStage: 1 }),
      makeContact({ email: 'c@x.com', confirmedAt: D14_AGO, dripStage: 2 }),
    ];
    const mocks = makeMocks();

    await runDripCycle({ contacts, now: NOW, ...mocks });

    expect(mocks.sendEmail).toHaveBeenCalledTimes(3);
    expect(mocks.sendEmail.mock.calls[0][0].subject).toBe(SUBJECT_1);
    expect(mocks.sendEmail.mock.calls[1][0].subject).toBe(SUBJECT_2);
    expect(mocks.sendEmail.mock.calls[2][0].subject).toBe(SUBJECT_3);
  });
});
