// POST /api/stripe/webhook — thin Vercel wrapper. bodyParser disabled so the
// raw bytes survive for Stripe signature verification (all logic in src/, pure
// + tested). This is the ONLY writer of the subscriptions table.
import { runVercelWebhook } from "../../src/vercel";
import type { RawReadableRequest, NodeLikeResponse } from "../../src/vercel";

export const config = { api: { bodyParser: false } };

export default function handler(req: RawReadableRequest, res: NodeLikeResponse): Promise<void> {
  return runVercelWebhook(req, res);
}
