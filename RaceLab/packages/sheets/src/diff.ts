import { getVersion } from "./sheets";
import type { SetupValues, SheetsState } from "./sheets";

/** One changed setting between two value sets. `from`/`to` are undefined when
 *  the field exists on only one side. */
export interface ChangedField {
  field: string;
  from: string | number | undefined;
  to: string | number | undefined;
}

/** The one diff function (D21): every comparison in the product goes through it. */
export function diffValues(from: SetupValues, to: SetupValues): ChangedField[] {
  const fields = new Set([...Object.keys(from), ...Object.keys(to)]);
  const changes: ChangedField[] = [];
  for (const field of fields) {
    if (from[field] !== to[field]) {
      changes.push({ field, from: from[field], to: to[field] });
    }
  }
  return changes.sort((a, b) => a.field.localeCompare(b.field));
}

/** Draft vs the version it branched from — the live "orange highlights". */
export function draftDiff(state: SheetsState): ChangedField[] {
  return diffValues(mustGet(state, state.draft_base_id), state.draft);
}

/** Any two saved versions ("vs" compare). */
export function diffVersions(state: SheetsState, aId: string, bId: string): ChangedField[] {
  return diffValues(mustGet(state, aId), mustGet(state, bId));
}

/** Draft vs the locked kit baseline — one tap from the editor. */
export function diffVsKit(state: SheetsState): ChangedField[] {
  const kit = state.versions.find((v) => v.parent_id === null && v.locked);
  if (!kit) throw new Error("SheetsState has no kit root version");
  return diffValues(kit.values, state.draft);
}

/** A dangling id is corruption, not "empty setup" — fail loudly instead of
 *  rendering an everything-changed diff the user would trust. */
function mustGet(state: SheetsState, id: string): SetupValues {
  const version = getVersion(state, id);
  if (!version) throw new Error(`Unknown setup version '${id}'`);
  return version.values;
}
