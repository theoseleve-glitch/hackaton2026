// POST /api/webhooks/stripe — RAW-BODY exception. Stripe verifies a signature
// over the *exact* request bytes, so Vercel's JSON bodyParser must be OFF here;
// runVercelRaw feeds the untouched body to the (pure, tested) src/ handler.
import { runVercelRaw } from "../../src/vercel";
import type { NodeLikeRequest, NodeLikeResponse } from "../../src/vercel";

export const config = { api: { bodyParser: false } };

export default function handler(req: NodeLikeRequest, res: NodeLikeResponse): Promise<void> {
  return runVercelRaw(req, res);
}
