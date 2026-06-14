/**
 * Social layer — sharing a dialed-in setup is the viral loop of RaceLab.
 * A SharedPayload is a self-contained snapshot of one setup plus the context
 * that earned it (car, track, conditions, result). It travels as a portable
 * link with no account and no server: the receiver imports it, optionally
 * forks it, and the lineage (forked_from / author handle) is the social proof.
 *
 * TrackCandidacy tracks a separate flow: a user nominates a track they ran so
 * it can graduate from a personal entry to an "official" community track. The
 * backend owns the verdict; the client mirrors it as CandidacyState.
 *
 * Pure data only — no I/O, no clock. Callers pass an ISO "now" string.
 */

export interface SharedPayload {
  v: 1;
  kind: "setup";
  id: string;
  created_at: string;
  setup: { name: string; template_id: string; values: Record<string, string | number> };
  car: { brand: string; model: string; category: string; scale: string; power: "nitro" | "electric" };
  context?: {
    track_name?: string;
    surface?: string;
    grip?: string;
    date?: string;
    weather?: { air_temp_c?: number; humidity_pct?: number; wind_kmh?: number };
    result?: { position?: number; entrants?: number; best_lap_s?: number };
  };
  comment?: string;
  author?: { handle?: string };
  forked_from?: string;
}

/** none = never nominated; candidate = submitted, awaiting verdict; the last
 *  two are backend-reflected outcomes. */
export type CandidacyState = "none" | "candidate" | "official" | "rejected";

export interface TrackCandidacy {
  track_id: string;
  state: CandidacyState;
  submitted_at?: string;
}

export interface CandidacyData {
  items: TrackCandidacy[];
}
