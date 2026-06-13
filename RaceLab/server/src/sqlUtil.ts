/**
 * Shared SQL/driver helpers. Dependency-free (imports nothing from db.ts or the
 * stores) so both db.ts and every store can use it without an import cycle.
 */

/** Normalize a driver timestamptz to strict ISO. Drivers return it as a Date OR
 *  as pg TEXT ("2026-06-13 12:00:00+00", neon's HTTP driver) depending on config;
 *  a bare String(v) would leak the non-ISO text onto the wire (breaking the
 *  contract + downstream Date.parse compares), so coerce strings through Date too. */
export function isoOf(v: unknown): string {
  if (v instanceof Date) return v.toISOString();
  const d = new Date(String(v));
  return Number.isNaN(d.getTime()) ? String(v) : d.toISOString();
}
