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

/**
 * Driver identity — the public card a handle carries across the social layer:
 * who they are (handle/display_name/avatar), where they run (country/home_track/
 * classes), and a rolled-up career line. All but `handle` is optional so a fresh
 * profile is just a name; the backend fills the rest as runs accrue.
 */
export interface DriverProfile {
  handle: string;
  display_name?: string;
  avatar_uri?: string;
  level?: "beginner" | "club" | "regional" | "pro";
  country?: string;
  home_track?: string;
  classes?: string[];
  career?: {
    runs: number;
    races: number;
    podiums: number;
    wins: number;
    best_lap_s?: number;
    best_lap_track?: string;
  };
}

/** A feed entry is either a forkable shared setup or a posted race result. */
export type FeedItemKind = "shared_setup" | "result";

export interface FeedItem {
  id: string;
  kind: FeedItemKind;
  created_at: string;
  author: { handle: string; avatar_uri?: string; level?: string };
  /** present when kind==="shared_setup" (forkable via the share module) */
  payload?: SharedPayload;
  result?: {
    track_name: string;
    position?: number;
    entrants?: number;
    best_lap_s?: number;
    car?: string;
  };
  text?: string;
}

/** The set of handles the local user follows — order is the only state. */
export interface FollowData {
  handles: string[];
}
