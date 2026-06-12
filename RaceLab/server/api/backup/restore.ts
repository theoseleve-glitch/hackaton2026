// GET /api/backup/restore — thin Vercel wrapper; all logic in src/ (pure, tested).
import { runVercel } from "../../src/vercel";
import type { NodeLikeRequest, NodeLikeResponse } from "../../src/vercel";

export default function handler(req: NodeLikeRequest, res: NodeLikeResponse): Promise<void> {
  return runVercel(req, res);
}
