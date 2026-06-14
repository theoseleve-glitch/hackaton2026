// T096 — drip-cycle handler. Pure logic over four injected
// callbacks (sendEmail, updateContactStage, getUnsubUrl, plus the
// contact list and now). T104 already shipped the per-contact
// scheduling primitive `decideDripStage`; THIS layer wraps it with
// stage-by-stage email dispatch + per-recipient error capture +
// stage-increment idempotency.
//
// Contract:
//   1. For every non-unsubscribed contact whose decideDripStage
//      returns 1|2|3, the handler mints an unsubscribe URL, renders
//      the matching email module's bodies, sends the email, and
//      bumps drip_stage on the contact.
//   2. Errors per-contact are captured into the summary's `errors`
//      array; the loop continues to the next contact rather than
//      halting the whole cron.
//   3. The handler is purely sync over its inputs — calling it
//      twice with the SAME contacts array gives the same result.
//      Idempotency in production comes from the caller persisting
//      the dripStage bump back to Resend BEFORE the next cron fires
//      (so the second cron sees the advanced stage and skips).
//
// The Cloudflare-Pages scheduled handler in functions/_scheduled/
// waitlist-drip.ts wires the four callbacks to real Resend API
// calls. Splitting it this way keeps the loop's decision logic
// fully unit-testable here while the deploy-only piece (cron
// firing, audience pagination, real fetch calls) lands when T008
// unblocks runtime activation.

import { decideDripStage, type DripEmailNumber } from '../drip-scheduler';
import { SUBJECT as SUBJECT_1, bodies as bodies_1 } from './email-1';
import { SUBJECT as SUBJECT_2, bodies as bodies_2 } from './email-2';
import { SUBJECT as SUBJECT_3, bodies as bodies_3 } from './email-3';

export interface ContactState {
  readonly email: string;
  readonly confirmedAt: Date;
  readonly dripStage: number;
  readonly unsubscribed: boolean;
}

export interface SendEmailParams {
  readonly to: string;
  readonly subject: string;
  readonly html: string;
  readonly text: string;
}

export type SendEmailFn = (params: SendEmailParams) => Promise<void>;

export interface UpdateContactStageParams {
  readonly email: string;
  readonly newStage: DripEmailNumber;
}

export type UpdateContactStageFn = (
  params: UpdateContactStageParams,
) => Promise<void>;

export type GetUnsubUrlFn = (email: string) => Promise<string>;

export interface RunDripCycleParams {
  readonly contacts: readonly ContactState[];
  readonly now: Date;
  readonly sendEmail: SendEmailFn;
  readonly updateContactStage: UpdateContactStageFn;
  readonly getUnsubUrl: GetUnsubUrlFn;
}

export interface DripCycleError {
  readonly email: string;
  readonly reason: string;
}

export interface DripCycleSummary {
  readonly examined: number;
  readonly sent: number;
  readonly errors: readonly DripCycleError[];
}

const EMAIL_MODULES: Record<
  DripEmailNumber,
  { readonly subject: string; readonly bodies: (unsubUrl: string) => { html: string; text: string } }
> = {
  1: { subject: SUBJECT_1, bodies: bodies_1 },
  2: { subject: SUBJECT_2, bodies: bodies_2 },
  3: { subject: SUBJECT_3, bodies: bodies_3 },
};

export async function runDripCycle(
  params: RunDripCycleParams,
): Promise<DripCycleSummary> {
  const { contacts, now, sendEmail, updateContactStage, getUnsubUrl } = params;
  const errors: DripCycleError[] = [];
  let sent = 0;

  for (const contact of contacts) {
    if (contact.unsubscribed) continue;

    const stage = decideDripStage(contact.confirmedAt, contact.dripStage, now);
    if (stage === null) continue;

    try {
      const unsubUrl = await getUnsubUrl(contact.email);
      const module = EMAIL_MODULES[stage];
      const { html, text } = module.bodies(unsubUrl);
      await sendEmail({
        to: contact.email,
        subject: module.subject,
        html,
        text,
      });
      await updateContactStage({ email: contact.email, newStage: stage });
      sent += 1;
    } catch (e) {
      errors.push({
        email: contact.email,
        reason: e instanceof Error ? e.message : String(e),
      });
    }
  }

  return { examined: contacts.length, sent, errors };
}
