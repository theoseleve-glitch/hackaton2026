/**
 * Speedhive capture: pulls a pilot's recent MYLAPS practice sessions so we can
 * prefill a run log (best/avg/lap list). Like weather.ts, this is DATA CAPTURE,
 * not advice — the engine (D18) never touches the network; it only reads numbers
 * stored from here.
 *
 * Auth model (see docs/research/speedhive-api.md): link ONCE by transponder
 * number, then poll on app open. No OAuth, no per-launch login — RC practice
 * data is public and keyed by the transponder. These are the Speedhive web
 * app's own backends (no official API), so every call degrades to null/[] on
 * failure and a MOCK fallback covers the unreachable case.
 */

/** Set false to hit the real Speedhive backend. true returns a deterministic
 *  fake session whenever the network is unreachable (dev/offline/demo). */
const SPEEDHIVE_MOCK = true;

const BASE = "https://practice-api.speedhive.com";
/** practice-api returns 401 Bearer WITHOUT this header — it gates on Origin. */
const HEADERS: Record<string, string> = {
  Accept: "application/json",
  Origin: "https://speedhive.mylaps.com",
};

export interface SpeedhiveSession {
  id: string;
  date_iso: string;
  location?: string;
  best_lap_s?: number;
  avg_lap_s?: number;
  laps?: number[];
}

/** Store the pilot's transponder/account id locally. Returns the cleaned value
 *  the caller should persist (settings/store) and pass to fetchRecentSessions.
 *  No verification — an unknown id simply yields an empty session list. */
export function linkAccount(identifier: string): string {
  return identifier.trim();
}

/** Speedhive lap durations are decimal-second strings ("24.248") or "m:ss.mmm"
 *  ("2:47.268"). Returns seconds, or undefined if unparseable. */
function parseDuration(raw: unknown): number | undefined {
  if (typeof raw !== "string" || raw.length === 0) return undefined;
  const parts = raw.split(":");
  let s = 0;
  for (const p of parts) {
    const n = Number(p);
    if (!Number.isFinite(n)) return undefined;
    s = s * 60 + n;
  }
  return Math.round(s * 1000) / 1000;
}

interface RawLap {
  duration?: string;
}
interface RawSession {
  id?: number;
  dateTimeStart?: string;
  bestLap?: { duration?: string };
  aveLapDuration?: string;
  laps?: RawLap[];
}
interface RawActivity {
  id?: number;
  startTime?: string;
  location?: { name?: string };
}
interface RawActivitiesResponse {
  activities?: RawActivity[];
}
interface RawSessionsResponse {
  sessions?: RawSession[];
}

/** Map one practice activity's sessions into our flat shape. Each Speedhive
 *  "activity" (a day's practice block) holds numbered sessions; we surface each
 *  session as one SpeedhiveSession the pilot can turn into a run log. */
function mapSessions(
  activity: RawActivity,
  sessions: RawSession[],
): SpeedhiveSession[] {
  const location = activity.location?.name;
  return sessions.map((s, i) => {
    const laps = (s.laps ?? [])
      .map((l) => parseDuration(l.duration))
      .filter((n): n is number => typeof n === "number");
    return {
      id: `${activity.id ?? "act"}-${s.id ?? i}`,
      date_iso: s.dateTimeStart ?? activity.startTime ?? "",
      location,
      best_lap_s: parseDuration(s.bestLap?.duration),
      avg_lap_s: parseDuration(s.aveLapDuration),
      laps: laps.length > 0 ? laps : undefined,
    };
  });
}

/** A single deterministic fake session — used by the MOCK fallback so the UI
 *  has something to render offline. Dated `sinceIso` (or now) for stable order. */
function mockSessions(sinceIso?: string): SpeedhiveSession[] {
  const laps = [24.248, 24.109, 23.781, 23.33, 23.512, 23.928];
  const best = Math.min(...laps);
  const avg = Math.round((laps.reduce((a, b) => a + b, 0) / laps.length) * 1000) /
    1000;
  return [
    {
      id: "mock-1",
      date_iso: sinceIso ?? new Date().toISOString(),
      location: "AMCA Apeldoorn (mock)",
      best_lap_s: best,
      avg_lap_s: avg,
      laps,
    },
  ];
}

/** Fetch practice sessions for a transponder newer than `sinceIso`. Returns []
 *  (or the MOCK session if SPEEDHIVE_MOCK) when the network is unreachable —
 *  offline at the track is the normal case, not an error. */
export async function fetchRecentSessions(
  identifier: string,
  sinceIso: string,
): Promise<SpeedhiveSession[]> {
  const id = identifier.trim();
  if (id.length === 0) return [];
  try {
    const url =
      `${BASE}/api/v1/chips/${encodeURIComponent(id)}/training/activities` +
      `?order=desc&count=20`;
    const res = await fetch(url, { headers: HEADERS });
    if (!res.ok) return SPEEDHIVE_MOCK ? mockSessions(sinceIso) : [];
    const data = (await res.json()) as RawActivitiesResponse;
    const since = Date.parse(sinceIso);
    const fresh = (data.activities ?? []).filter((a) => {
      const t = Date.parse(a.startTime ?? "");
      return !Number.isFinite(since) || (Number.isFinite(t) && t > since);
    });

    const out: SpeedhiveSession[] = [];
    for (const act of fresh) {
      if (act.id === undefined) continue;
      const sRes = await fetch(
        `${BASE}/api/v1/training/activities/${act.id}/sessions`,
        { headers: HEADERS },
      );
      if (!sRes.ok) continue;
      const sData = (await sRes.json()) as RawSessionsResponse;
      out.push(...mapSessions(act, sData.sessions ?? []));
    }
    return out;
  } catch {
    return SPEEDHIVE_MOCK ? mockSessions(sinceIso) : [];
  }
}
