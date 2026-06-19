// POST /api/stripe/portal — thin Vercel wrapper (normal JSON body, logic in
// src/). Opens the Stripe Customer Portal for the Clerk user.
import { runVercel } from "../../src/vercel";
import type { NodeLikeRequest, NodeLikeResponse } from "../../src/vercel";

export default function handler(req: NodeLikeRequest, res: NodeLikeResponse): Promise<void> {
  return runVercel(req, res);
}
