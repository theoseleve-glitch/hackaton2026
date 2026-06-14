import type { SharedPayload } from "./types";

/**
 * Fork provenance — the human-readable credit line shown when a setup was
 * forked from a shared payload. Pure formatting: author handle leads when
 * present ("Forked from @handle's setup"), otherwise an anonymous credit
 * ("Forked setup"); date and track name append as optional " · " suffixes.
 */
export function forkProvenanceLine(p: SharedPayload): string {
  const handle = p.author?.handle;
  const head = handle ? `Forked from @${handle}'s setup` : "Forked setup";
  const suffixes: string[] = [];
  const date = p.context?.date;
  const track = p.context?.track_name;
  if (date) suffixes.push(date);
  if (track) suffixes.push(track);
  return suffixes.length ? `${head} · ${suffixes.join(" · ")}` : head;
}
