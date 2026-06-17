// POST /api/cron/workers — scheduled worker fan-out (Vercel Cron). Secret-gated
// by x-cron-secret (see src/handlers/cron.ts); all logic in src/ (pure, tested).
import { runVercel } from "../../src/vercel";
import type { NodeLikeRequest, NodeLikeResponse } from "../../src/vercel";

export default function handler(req: NodeLikeRequest, res: NodeLikeResponse): Promise<void> {
  return runVercel(req, res);
}
