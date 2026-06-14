/**
 * Social network client — the offline MOCK backing the feed/discover/profile
 * screens. Modeled on speedhive.ts: a SOCIAL_MOCK flag gates a deterministic
 * fake backend so the demo is never blank and never hits the network. There is
 * no real backend yet; when one exists, flip SOCIAL_MOCK to false and swap the
 * bodies for fetch() calls behind the same three signatures.
 *
 * Determinism is load-bearing here — NO Math.random, NO new Date(). Every
 * created_at and every buildSetupPayload `now` is a fixed ISO literal so the
 * seed feed renders identically on every launch (and in tests/snapshots).
 */

import { buildSetupPayload } from "../../../packages/social/src";
import type { DriverProfile, FeedItem } from "../../../packages/social/src";

/** Set false to hit a real social backend (none exists yet). true returns the
 *  deterministic seed data below so the social screens always have content. */
export const SOCIAL_MOCK = true;

/** Seed roster — five believable RC drivers with real palmarès. Order here is
 *  the canonical "suggested drivers" order used by discover and the empty feed. */
const DRIVERS: DriverProfile[] = [
  {
    handle: "theo-pro",
    display_name: "Théo Seleve",
    level: "pro",
    country: "FR",
    home_track: "Mini-Racing Stadium Spéracèdes",
    classes: ["1/8 nitro buggy", "1/8 nitro truggy"],
    career: {
      runs: 412,
      races: 88,
      podiums: 41,
      wins: 19,
      best_lap_s: 22.84,
      best_lap_track: "Mini-Racing Stadium Spéracèdes",
    },
  },
  {
    handle: "mariko",
    display_name: "Mariko Tanaka",
    level: "regional",
    country: "JP",
    home_track: "Kyosho Circuit Yatabe Arena",
    classes: ["1/8 nitro buggy"],
    career: {
      runs: 305,
      races: 64,
      podiums: 27,
      wins: 9,
      best_lap_s: 23.41,
      best_lap_track: "Kyosho Circuit Yatabe Arena",
    },
  },
  {
    handle: "luca",
    display_name: "Luca Ferrari",
    level: "regional",
    country: "IT",
    home_track: "Pista RC Vighizzolo",
    classes: ["1/8 nitro buggy", "1/10 electric buggy"],
    career: {
      runs: 268,
      races: 52,
      podiums: 18,
      wins: 6,
      best_lap_s: 23.77,
      best_lap_track: "Pista RC Vighizzolo",
    },
  },
  {
    handle: "alex",
    display_name: "Alex Müller",
    level: "club",
    country: "DE",
    home_track: "MAC Pulheim",
    classes: ["1/8 nitro buggy"],
    career: {
      runs: 134,
      races: 21,
      podiums: 5,
      wins: 1,
      best_lap_s: 24.62,
      best_lap_track: "MAC Pulheim",
    },
  },
  {
    handle: "sam",
    display_name: "Sam Carter",
    level: "beginner",
    country: "GB",
    home_track: "Mendip Raceway",
    classes: ["1/10 electric buggy"],
    career: {
      runs: 47,
      races: 6,
      podiums: 0,
      wins: 0,
      best_lap_s: 26.18,
      best_lap_track: "Mendip Raceway",
    },
  },
];

function driver(handle: string): DriverProfile {
  return DRIVERS.find((d) => d.handle === handle) as DriverProfile;
}

/** Author stub for a feed item, pulled from the seed roster (handle + level). */
function authorOf(handle: string): FeedItem["author"] {
  const d = driver(handle);
  return { handle: d.handle, level: d.level };
}

/** The full seed feed — six items, newest first. A mix of forkable shared
 *  setups (each a REAL SharedPayload) and posted results. All timestamps are
 *  fixed literals so ordering and rendering are stable across launches. */
const FEED: FeedItem[] = [
  {
    id: "feed-1",
    kind: "shared_setup",
    created_at: "2026-06-10T16:20:00.000Z",
    author: authorOf("theo-pro"),
    text: "High-grip blue-groove tune from this weekend's A-main — diffs tightened a touch.",
    payload: buildSetupPayload(
      {
        setup: {
          name: "Spéracèdes A-main (high grip)",
          template_id: "kyosho-inferno-mp11",
          values: {
            front_diff_oil: "7000",
            center_diff_oil: "5000",
            rear_diff_oil: "3000",
            front_shock_oil: "450",
            rear_shock_oil: "400",
            droop_front: "3.0",
            droop_rear: "2.0",
            ride_height_front: "23",
            ride_height_rear: "24",
            camber_front: "-1.5",
            camber_rear: "-2.0",
          },
        },
        car: {
          brand: "Kyosho",
          model: "Inferno MP11",
          category: "1/8 nitro buggy",
          scale: "1/8",
          power: "nitro",
        },
        context: {
          track_name: "Mini-Racing Stadium Spéracèdes",
          surface: "clay",
          grip: "high",
          result: { position: 1, entrants: 32, best_lap_s: 22.84 },
        },
        author: { handle: "theo-pro" },
      },
      "2026-06-10T16:20:00.000Z",
    ),
  },
  {
    id: "feed-2",
    kind: "result",
    created_at: "2026-06-09T18:45:00.000Z",
    author: authorOf("mariko"),
    text: "Qualified P2, finished P2. Lost the lead on a late traffic mistake.",
    result: {
      track_name: "Kyosho Circuit Yatabe Arena",
      position: 2,
      entrants: 40,
      best_lap_s: 23.41,
      car: "Kyosho Inferno MP11",
    },
  },
  {
    id: "feed-3",
    kind: "shared_setup",
    created_at: "2026-06-08T11:05:00.000Z",
    author: authorOf("luca"),
    text: "Low-grip dusty setup for Vighizzolo — softened everything, more droop.",
    payload: buildSetupPayload(
      {
        setup: {
          name: "Vighizzolo dusty (low grip)",
          template_id: "kyosho-inferno-mp11",
          values: {
            front_diff_oil: "5000",
            center_diff_oil: "7000",
            rear_diff_oil: "5000",
            front_shock_oil: "350",
            rear_shock_oil: "325",
            droop_front: "4.0",
            droop_rear: "3.5",
            ride_height_front: "25",
            ride_height_rear: "26",
            camber_front: "-1.0",
            camber_rear: "-1.5",
          },
        },
        car: {
          brand: "Kyosho",
          model: "Inferno MP11",
          category: "1/8 nitro buggy",
          scale: "1/8",
          power: "nitro",
        },
        context: {
          track_name: "Pista RC Vighizzolo",
          surface: "clay",
          grip: "low",
          result: { position: 4, entrants: 28, best_lap_s: 23.77 },
        },
        author: { handle: "luca" },
      },
      "2026-06-08T11:05:00.000Z",
    ),
  },
  {
    id: "feed-4",
    kind: "result",
    created_at: "2026-06-07T14:30:00.000Z",
    author: authorOf("alex"),
    text: "First-ever podium at the club race! P3, super happy.",
    result: {
      track_name: "MAC Pulheim",
      position: 3,
      entrants: 18,
      best_lap_s: 24.62,
      car: "Kyosho Inferno MP11",
    },
  },
  {
    id: "feed-5",
    kind: "shared_setup",
    created_at: "2026-06-06T09:15:00.000Z",
    author: authorOf("mariko"),
    text: "Medium-grip baseline I keep coming back to — good starting point anywhere.",
    payload: buildSetupPayload(
      {
        setup: {
          name: "Yatabe medium baseline",
          template_id: "kyosho-inferno-mp11",
          values: {
            front_diff_oil: "6000",
            center_diff_oil: "6000",
            rear_diff_oil: "4000",
            front_shock_oil: "400",
            rear_shock_oil: "375",
            droop_front: "3.5",
            droop_rear: "2.5",
            ride_height_front: "24",
            ride_height_rear: "25",
            camber_front: "-1.5",
            camber_rear: "-1.5",
          },
        },
        car: {
          brand: "Kyosho",
          model: "Inferno MP11",
          category: "1/8 nitro buggy",
          scale: "1/8",
          power: "nitro",
        },
        context: {
          track_name: "Kyosho Circuit Yatabe Arena",
          surface: "carpet",
          grip: "medium",
          result: { position: 2, entrants: 40, best_lap_s: 23.41 },
        },
        author: { handle: "mariko" },
      },
      "2026-06-06T09:15:00.000Z",
    ),
  },
  {
    id: "feed-6",
    kind: "result",
    created_at: "2026-06-05T19:00:00.000Z",
    author: authorOf("sam"),
    text: "New PB lap time today, still learning the corners.",
    result: {
      track_name: "Mendip Raceway",
      position: 11,
      entrants: 14,
      best_lap_s: 26.18,
      car: "Associated RC10B7",
    },
  },
];

/** Fetch the feed. When `followedHandles` is non-empty, items from followed
 *  authors float to the top (stable order otherwise preserved) but the whole
 *  list is still returned so the feed never empties on a fresh follow. When
 *  empty, the full seed feed (suggested drivers) is returned so the demo always
 *  has content. */
export async function fetchFeed(followedHandles: string[]): Promise<FeedItem[]> {
  if (!SOCIAL_MOCK) return [];
  if (followedHandles.length === 0) return FEED;
  const followed = new Set(followedHandles);
  const from: FeedItem[] = [];
  const rest: FeedItem[] = [];
  for (const item of FEED) {
    if (followed.has(item.author.handle)) from.push(item);
    else rest.push(item);
  }
  return [...from, ...rest];
}

/** Suggested drivers to discover. Returns the full roster; the screen filters
 *  out who you already follow. */
export async function fetchDiscover(): Promise<DriverProfile[]> {
  if (!SOCIAL_MOCK) return [];
  return DRIVERS;
}

/** Look up one driver's public profile by handle, or null if unknown. */
export async function fetchProfile(handle: string): Promise<DriverProfile | null> {
  if (!SOCIAL_MOCK) return null;
  return DRIVERS.find((d) => d.handle === handle) ?? null;
}
