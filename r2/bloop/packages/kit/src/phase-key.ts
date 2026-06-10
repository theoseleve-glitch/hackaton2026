/**
 * phaseKey string conventions (cross-game synthesis §1.6) — `phaseKeyOf`
 * encodes them; using it is optional sugar, obeying them is not:
 *
 * - Colon-delimited segments, lowest-cardinality first: `"<phase>"`,
 *   `"<phase>:r<round>"`, or `"<phase>:r<round>:<sub>"`. The terminal phase
 *   is always the bare string `"over"`.
 * - The key MUST change on every transition the shell reacts to (new alarm,
 *   ad check, broadcast), including per-turn and per-reveal-beat transitions,
 *   and MUST NOT change for in-phase progress that keeps the running
 *   deadline.
 * - The key MUST NOT embed a secret (treat it as logged): no words, roles,
 *   ballots, answers — phase names, round numbers, turn indices only.
 * - Uniqueness: when a game has multiple actor-turns inside one logical
 *   round, the key MUST include a per-(phase, turn)-unique component —
 *   either a per-turn index (`phaseKeyOf('clue', 0, 't3')` -> "clue:r0:t3")
 *   or a global monotonic turnSeq (`phaseKeyOf('prompt', undefined, 7)` ->
 *   "prompt:7"). `round` alone is NOT sufficient for those games.
 */
export function phaseKeyOf(phase: string, round?: number, sub?: string | number): string {
  const segments: string[] = [phase];
  if (round !== undefined) segments.push(`r${round}`);
  if (sub !== undefined) segments.push(String(sub));
  return segments.join(':');
}
