// POST /api/stripe/checkout — thin Vercel wrapper (normal JSON body, logic in
// src/, pure + tested). Creates a Stripe Checkout Session for the Clerk user.
import { runVercel } from "../../src/vercel";
import type { NodeLikeRequest, NodeLikeResponse } from "../../src/vercel";

export default function handler(req: NodeLikeRequest, res: NodeLikeResponse): Promise<void> {
  return runVercel(req, res);
}
