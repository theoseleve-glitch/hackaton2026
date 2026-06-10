/**
 * Review M3 fix — the design's "2-version window" as ONE predicate:
 * accept iff pinned <= client <= pinned + 1. Rooms pin protocolVersion at
 * creation and never re-pin across deploys (§7.3); a client that updated
 * mid-session is one ahead and absorbed; an outdated client gets
 * UPGRADE_REQUIRED.
 */
export function acceptsProtocol(client: number, pinned: number): boolean {
  return client >= pinned && client <= pinned + 1;
}
