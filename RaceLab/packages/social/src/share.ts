import type { SharedPayload } from "./types";

/**
 * Shareable-snapshot serializers. The wire format is plain JSON wrapped in a
 * URL — deliberately NO Buffer/btoa so the exact same code runs in node, in
 * React Native (Hermes), and in a browser. The link is the whole product: it
 * carries everything the receiver needs to import (and optionally fork) a
 * setup with no account and no round-trip to a server.
 */

export interface BuildPayloadInput {
  setup: SharedPayload["setup"];
  car: SharedPayload["car"];
  context?: SharedPayload["context"];
  comment?: string;
  author?: { handle?: string };
  forked_from?: string;
}

/** Stamp a portable payload. id derives from `now` + a random suffix (the one
 *  allowed place for randomness); created_at is the passed `now`. */
export function buildSetupPayload(input: BuildPayloadInput, now: string): SharedPayload {
  const p: SharedPayload = {
    v: 1,
    kind: "setup",
    id: nextId(now),
    created_at: now,
    setup: input.setup,
    car: input.car,
  };
  if (input.context !== undefined) p.context = input.context;
  if (input.comment !== undefined) p.comment = input.comment;
  if (input.author !== undefined) p.author = input.author;
  if (input.forked_from !== undefined) p.forked_from = input.forked_from;
  return p;
}

export function serializePayload(p: SharedPayload): string {
  return JSON.stringify(p);
}

export type DeserializePayloadResult =
  | { ok: true; payload: SharedPayload }
  | { ok: false; reason: "bad_json" | "not_a_payload" | "unknown_version" };

/** Parse + validate. A version mismatch is NOT corruption — a newer share must
 *  read as unknown_version so the app can ask the user to update, not discard. */
export function deserializePayload(raw: string): DeserializePayloadResult {
  let p: SharedPayload;
  try {
    p = JSON.parse(raw) as SharedPayload;
  } catch {
    return { ok: false, reason: "bad_json" };
  }
  if (typeof p !== "object" || p === null) return { ok: false, reason: "not_a_payload" };
  if (p.v !== 1) return { ok: false, reason: "unknown_version" };
  if (!isPayloadShape(p)) return { ok: false, reason: "not_a_payload" };
  return { ok: true, payload: p };
}

export const IMPORT_LINK_BASE = "griplab://import";

export function payloadToLink(p: SharedPayload): string {
  return `${IMPORT_LINK_BASE}?d=${encodeURIComponent(serializePayload(p))}`;
}

/** Pull the `d=` param from a griplab://import?d=… link or a plain ?d=… URL,
 *  decode it, and deserialize. A missing param is not-a-payload, not bad_json. */
export function linkToPayload(url: string): DeserializePayloadResult {
  const d = extractParam(url, "d");
  if (d === undefined) return { ok: false, reason: "not_a_payload" };
  return deserializePayload(decodeURIComponent(d));
}

/** Minimal manual query parse — no URL/URLSearchParams dependency so this runs
 *  identically on every JS engine. Splits on the first `?`, then on `&`/`=`. */
function extractParam(url: string, key: string): string | undefined {
  const q = url.indexOf("?");
  if (q === -1) return undefined;
  const query = url.slice(q + 1);
  for (const pair of query.split("&")) {
    const eq = pair.indexOf("=");
    const k = eq === -1 ? pair : pair.slice(0, eq);
    if (k === key) return eq === -1 ? "" : pair.slice(eq + 1);
  }
  return undefined;
}

function isPayloadShape(p: SharedPayload): boolean {
  return (
    p.kind === "setup" &&
    typeof p.id === "string" &&
    typeof p.created_at === "string" &&
    typeof p.setup === "object" &&
    p.setup !== null &&
    typeof p.setup.name === "string" &&
    typeof p.setup.template_id === "string" &&
    typeof p.setup.values === "object" &&
    p.setup.values !== null &&
    // value-level validation: this is an account-FREE untrusted import (deep link / file),
    // so enforce the declared Record<string, string|number> contract rather than trusting
    // `typeof === object`. Reject arbitrary nested objects/arrays, non-finite numbers, and
    // oversized strings/maps (storage-bloat / mis-render guard).
    Object.keys(p.setup.values).length <= 256 &&
    Object.values(p.setup.values as Record<string, unknown>).every(
      (v) => (typeof v === "string" && v.length <= 200) || (typeof v === "number" && Number.isFinite(v)),
    ) &&
    p.setup.name.length <= 200 &&
    typeof p.car === "object" &&
    p.car !== null &&
    typeof p.car.brand === "string" &&
    typeof p.car.model === "string" &&
    typeof p.car.category === "string" &&
    typeof p.car.scale === "string" &&
    (p.car.power === "nitro" || p.car.power === "electric")
  );
}

function nextId(now: string): string {
  const rand = Math.random().toString(36).slice(2, 10);
  return `share-${Date.parse(now).toString(36)}-${rand}`;
}
