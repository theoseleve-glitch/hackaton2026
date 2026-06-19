import type { ChassisTemplate } from "../../engine/src/types";

/**
 * D21 data model: `versions` is append-only and immutable (kit baseline =
 * locked root); `draft` is the ONLY editing surface and remembers which
 * version it branched from (`draft_base_id`). Diffs are computed, never
 * stored. Every operation returns a new state — safe for React reducers.
 *
 * Saved versions are Object.frozen: ids are globally unique
 * (`<template_id>/kit` roots, random-suffixed saves) so session logs,
 * outcome records and shared snapshots can reference them across cars
 * and devices without collisions.
 */

export type SetupValues = Record<string, string | number>;

export interface SetupVersion {
  id: string;
  name: string;
  parent_id: string | null; // lineage; null only for the kit root
  template_id: string;
  values: SetupValues;
  created_at: string; // ISO
  locked: boolean; // kit baseline is locked (read-only reference)
  note?: string;
}

export interface SheetsState {
  template_id: string;
  versions: SetupVersion[];
  draft: SetupValues;
  draft_base_id: string;
  draft_name: string;
  starred: string[]; // field ids pinned to the top of the editor
}

/** Globally-unique id of a template's locked kit root. */
export function kitVersionId(templateId: string): string {
  return `${templateId}/kit`;
}

/** Kit-default values extracted from a chassis template (null defaults skipped). */
export function kitSetup(template: ChassisTemplate): SetupValues {
  const setup: SetupValues = {};
  for (const [id, field] of Object.entries(template.fields)) {
    const def = (field as { kit_default?: string | number | null }).kit_default;
    if (def !== undefined && def !== null) setup[id] = def;
  }
  return setup;
}

export function initSheets(template: ChassisTemplate, now: string): SheetsState {
  const kit: SetupVersion = freezeVersion({
    id: kitVersionId(template.template_id),
    name: `${template.model} kit setup`,
    parent_id: null,
    template_id: template.template_id,
    values: kitSetup(template),
    created_at: now,
    locked: true,
  });
  return {
    template_id: template.template_id,
    versions: [kit],
    draft: { ...kit.values },
    draft_base_id: kit.id,
    draft_name: "My setup",
    starred: [],
  };
}

export function setValue(state: SheetsState, field: string, value: string | number): SheetsState {
  if (state.draft[field] === value) return state;
  return { ...state, draft: { ...state.draft, [field]: value } };
}

export function toggleStar(state: SheetsState, field: string): SheetsState {
  const starred = state.starred.includes(field)
    ? state.starred.filter((f) => f !== field)
    : [...state.starred, field];
  return { ...state, starred };
}

export function renameDraft(state: SheetsState, name: string): SheetsState {
  return { ...state, draft_name: name };
}

export function getVersion(state: SheetsState, id: string): SetupVersion | undefined {
  return state.versions.find((v) => v.id === id);
}

/**
 * Freeze the draft as a new immutable version (parent = the version the draft
 * was branched from) and rebase the draft onto it. Identical values never
 * mint a version — renaming is `renameVersion`, not duplicate-to-rename.
 */
export function saveVersion(
  state: SheetsState,
  now: string,
  name?: string,
): { state: SheetsState; saved: SetupVersion | null } {
  const base = getVersion(state, state.draft_base_id);
  if (base !== undefined && shallowEqual(state.draft, base.values)) {
    return { state, saved: null };
  }
  const versionName = (name ?? state.draft_name).trim() || "Unnamed setup";

  const version = freezeVersion({
    id: nextId(now),
    name: versionName,
    parent_id: state.draft_base_id,
    template_id: state.template_id,
    values: { ...state.draft },
    created_at: now,
    locked: false,
  });
  return {
    state: {
      ...state,
      versions: [...state.versions, version],
      draft_base_id: version.id,
      draft_name: versionName,
    },
    saved: version,
  };
}

/** Relabel a saved version (name/note are labels, not facts — D21). Locked
 *  kit roots and unknown ids are refused (state returned unchanged). */
export function renameVersion(state: SheetsState, id: string, name: string): SheetsState {
  const version = getVersion(state, id);
  const trimmed = name.trim();
  if (!version || version.locked || !trimmed || version.name === trimmed) return state;
  const renamed = freezeVersion({ ...version, name: trimmed });
  return {
    ...state,
    versions: state.versions.map((v) => (v.id === id ? renamed : v)),
    draft_name: state.draft_base_id === id ? trimmed : state.draft_name,
  };
}

/** Branch the draft from a saved version ("load" / the read half of duplicate). */
export function loadVersion(state: SheetsState, id: string): SheetsState {
  const version = getVersion(state, id);
  if (!version) return state;
  return {
    ...state,
    draft: { ...version.values },
    draft_base_id: version.id,
    draft_name: version.locked ? "My setup" : version.name,
  };
}

function freezeVersion(version: SetupVersion): SetupVersion {
  Object.freeze(version.values);
  return Object.freeze(version);
}

function nextId(now: string): string {
  const rand = Math.random().toString(36).slice(2, 10);
  return `sv-${Date.parse(now).toString(36)}-${rand}`;
}

function shallowEqual(a: SetupValues, b: SetupValues): boolean {
  const keys = new Set([...Object.keys(a), ...Object.keys(b)]);
  for (const k of keys) if (a[k] !== b[k]) return false;
  return true;
}
