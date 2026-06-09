import type { GameModule, PlayerId } from './types.js';

/**
 * Value-based redaction audit: serialize each viewer's view and report any
 * secret VALUES that appear in it (owners of a secret are exempt for their
 * own secret). Use for secrets that must never appear anywhere in a
 * non-owner's view — role assignments, secret words, answer keys. Not
 * suitable for secrets that legitimately appear elsewhere in views (e.g.
 * player ids): those need field-level assertions in the game's own tests.
 * Matching is substring containment on the serialized view: overlapping
 * non-secret content can produce false positives — they fail loud and are
 * safe to investigate, never silently pass.
 */
export function leakedSecrets<S, A, V, C>(
  module: GameModule<S, A, V, C>,
  state: S,
  viewers: ReadonlyArray<PlayerId>,
  secrets: ReadonlyArray<{ value: string; owner?: PlayerId }>,
): Array<{ viewer: PlayerId; value: string }> {
  const leaks: Array<{ viewer: PlayerId; value: string }> = [];
  for (const viewer of viewers) {
    const json = JSON.stringify(module.view(state, viewer));
    for (const secret of secrets) {
      if (secret.value === '') {
        throw new Error('leakedSecrets: empty secret value is not auditable');
      }
      if (secret.owner === viewer) continue;
      // match the value as it would be escaped inside a JSON string
      const escaped = JSON.stringify(secret.value).slice(1, -1);
      if (json.includes(escaped)) leaks.push({ viewer, value: secret.value });
    }
  }
  return leaks;
}
