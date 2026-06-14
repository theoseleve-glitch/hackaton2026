import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import type { ChassisTemplate } from "../../engine/src/types";
import {
  freezeHistory,
  initSheets,
  kitVersionId,
  loadVersion,
  renameVersion,
  saveVersion,
  setValue,
  toggleStar,
} from "./sheets";
import type { SetupVersion, SheetsState } from "./sheets";
import { diffValues, diffVersions, diffVsKit, draftDiff } from "./diff";
import { deserialize, serialize } from "./persist";

const template = JSON.parse(
  readFileSync(
    join(dirname(fileURLToPath(import.meta.url)), "..", "..", "kb", "chassis", "inferno-mp11.json"),
    "utf8",
  ),
) as ChassisTemplate;

const KIT = kitVersionId(template.template_id);

let failures = 0;
function check(label: string, ok: boolean, detail?: string): void {
  if (ok) {
    console.log(`✓ ${label}`);
  } else {
    failures++;
    console.log(`✗ ${label}${detail ? ` — ${detail}` : ""}`);
  }
}

const T0 = "2026-06-11T10:00:00.000Z";
const T1 = "2026-06-11T10:05:00.000Z";
const T2 = "2026-06-11T10:10:00.000Z";

// init: kit root locked, draft branched from it, no changes
let s = initSheets(template, T0);
check("init: kit root is locked, globally-unique id, null parent", s.versions.length === 1 && s.versions[0].id === KIT && s.versions[0].locked && s.versions[0].parent_id === null);
check("init: draft branches from kit with no changes", s.draft_base_id === KIT && draftDiff(s).length === 0);
check("init: kit defaults present in draft", s.draft.front_diff_oil === 8000 && s.draft.rear_sway_bar === 2.8);

// editing the draft → live diff vs base (the orange highlights)
const before = s;
s = setValue(s, "front_sway_bar", 2.2);
check("setValue returns a NEW state (immutability)", s !== before && before.draft.front_sway_bar === 2.3);
check("draftDiff shows exactly the change", JSON.stringify(draftDiff(s)) === JSON.stringify([{ field: "front_sway_bar", from: 2.3, to: 2.2 }]));
check("setValue same value is a no-op (same reference)", setValue(s, "front_sway_bar", 2.2) === s);

// save → immutable version with correct lineage, draft rebased
const save1 = saveVersion(s, T1, "Softer front bar");
check("saveVersion succeeds (ok:true)", save1.ok);
if (!save1.ok) throw new Error("save1 unexpectedly failed");
s = save1.state;
check("saveVersion appends with parent = old base", save1.saved !== null && save1.saved.parent_id === KIT && s.versions.length === 2);
check("draft rebased onto the new version (diff now empty)", s.draft_base_id === save1.saved!.id && draftDiff(s).length === 0);
const noop = saveVersion(s, T2, "fancy new name");
check("saving identical values is a no-op even with a new name", noop.ok && noop.saved === null);
check("saved versions are deep-frozen", Object.isFrozen(save1.saved) && Object.isFrozen(save1.saved!.values));
check("mutating a saved version's values throws", (() => { try { (save1.saved!.values as Record<string, number>).front_sway_bar = 9; return false; } catch { return true; } })());

// FIX 4: id has the schema-style fixed-width 8-char base36 suffix, injected rand
const detSave = saveVersion(setValue(s, "front_sway_bar", 1.9), T1, "det", () => 0.5);
check("saveVersion id matches sv-<ts36>-<rand8> shape", detSave.ok && /^sv-[0-9a-z]+-[0-9a-z]{8}$/.test(detSave.saved!.id));
const detSave2 = saveVersion(setValue(s, "front_sway_bar", 1.9), T1, "det", () => 0.5);
check("injected rand is deterministic (same inputs → same id)", detSave.ok && detSave2.ok && detSave.saved!.id === detSave2.saved!.id);
// FIX 4: bad clock → discriminated refusal, never a NaN-poisoned id or a throw
const bad = saveVersion(setValue(s, "front_sway_bar", 1.8), "not-a-date", "x");
check("saveVersion on a bad clock refuses (ok:false, bad_clock), never NaN id", !bad.ok && (bad as { reason: string }).reason === "bad_clock");

// second change + save → lineage chain; version-vs-version diff; unique ids
s = setValue(s, "rear_diff_oil", 4000);
const save2 = saveVersion(s, T2, "Thicker rear diff");
if (!save2.ok) throw new Error("save2 unexpectedly failed");
s = save2.state;
check("lineage chains saves", save2.saved!.parent_id === save1.saved!.id);
check("version ids are unique", new Set(s.versions.map((v) => v.id)).size === s.versions.length);
const vs = diffVersions(s, KIT, save2.saved!.id);
check("vs-compare kit → v2 shows both changes", vs.length === 2 && vs.some((c) => c.field === "front_sway_bar") && vs.some((c) => c.field === "rear_diff_oil"));
check("diffVsKit equals vs-compare with kit", JSON.stringify(diffVsKit(s)) === JSON.stringify(vs));
check("diff on a dangling id throws (no everything-changed lies)", (() => { try { diffVersions(s, "sv-ghost", KIT); return false; } catch { return true; } })());

// history is immune to later draft edits
s = setValue(s, "rear_diff_oil", 5000);
check("history untouched by later draft edits", save2.saved!.values.rear_diff_oil === 4000 && s.versions[2].values.rear_diff_oil === 4000);

// rename a saved version (labels are not facts)
s = renameVersion(s, save2.saved!.id, "Q2 sheet");
check("renameVersion relabels without minting a version", s.versions.length === 3 && s.versions[2].name === "Q2 sheet" && s.versions[2].values.rear_diff_oil === 4000);
check("renameVersion updates draft_name when renaming the base", s.draft_name === "Q2 sheet");
check("renameVersion refuses the locked kit", renameVersion(s, KIT, "hacked") === s);

// load an old version → draft branches from it
s = loadVersion(s, save1.saved!.id);
check("loadVersion branches the draft", s.draft_base_id === save1.saved!.id && s.draft.rear_diff_oil === 3000 && draftDiff(s).length === 0);
check("loading the locked kit names the draft fresh", loadVersion(s, KIT).draft_name === "My setup");

// starred
s = toggleStar(s, "front_sway_bar");
check("star pins a field", s.starred.includes("front_sway_bar"));
check("star toggles off", !toggleStar(s, "front_sway_bar").starred.includes("front_sway_bar"));

// serialization roundtrip + failure discrimination
const raw = serialize(s);
const back = deserialize(raw, template.template_id);
check("serialize/deserialize roundtrip", back.ok && JSON.stringify(back.state) === JSON.stringify(s));
check("deserialize discriminates wrong template", !deserialize(raw, "other-car").ok && (deserialize(raw, "other-car") as { reason: string }).reason === "wrong_template");
check("deserialize discriminates garbage as corrupt", (deserialize("{not json", template.template_id) as { reason: string }).reason === "corrupt");
check("deserialize discriminates future formats (no silent wipe)", (deserialize(raw.replace('"format":1', '"format":99'), template.template_id) as { reason: string }).reason === "unknown_format");
check("deserialize rejects dangling draft_base_id", !deserialize(raw.replace(new RegExp(`"draft_base_id":"[^"]+"`), '"draft_base_id":"sv-ghost"'), template.template_id).ok);
check("deserialize rejects a version missing values", !deserialize(raw.replace('"values"', '"valuez"'), template.template_id).ok);

// FIX 1: deep-freeze MUST survive the persist round-trip — JSON.parse hands back
// mutable objects, so without re-freezing the "locked" kit and saved versions
// become editable again.
const rt = deserialize(raw, template.template_id);
check("deserialize result is ok", rt.ok);
if (!rt.ok) throw new Error("roundtrip unexpectedly failed");
check("round-trip: versions array is frozen", Object.isFrozen(rt.state.versions));
check("round-trip: every version + its values are frozen", rt.state.versions.every((v) => Object.isFrozen(v) && Object.isFrozen(v.values)));
const rtKit = rt.state.versions.find((v) => v.id === KIT)!;
check("round-trip: mutating the locked kit values is a no-op / throws (stays frozen)", (() => { try { (rtKit.values as Record<string, number>).front_sway_bar = 99; } catch { /* strict mode throws */ } return rtKit.values.front_sway_bar !== 99 && Object.isFrozen(rtKit.values); })());
check("round-trip: pushing onto the frozen versions array is a no-op / throws", (() => { const n = rt.state.versions.length; try { (rt.state.versions as SetupVersion[]).push(rtKit); } catch { /* strict mode throws */ } return rt.state.versions.length === n; })());
// the draft stays mutable on purpose (it is the editing surface)
check("round-trip: draft remains mutable (editing surface)", !Object.isFrozen(rt.state.draft));

// FIX 2: a kit-less blob must fail validation as 'corrupt' up front, NOT pass
// then throw an uncaught Error out of diffVsKit on first use.
const kitless: SheetsState = {
  template_id: template.template_id,
  versions: [{ id: "sv-orphan", name: "orphan", parent_id: "sv-missing", template_id: template.template_id, values: { a: 1 }, created_at: T0, locked: false }],
  draft: { a: 1 },
  draft_base_id: "sv-orphan",
  draft_name: "x",
  starred: [],
};
const kitlessRaw = serialize(kitless);
const kitlessRes = deserialize(kitlessRaw, template.template_id);
check("deserialize rejects a kit-less blob as corrupt (no later diffVsKit throw)", !kitlessRes.ok && (kitlessRes as { reason: string }).reason === "corrupt");
// and prove the danger the guard removes: such a state WOULD throw in diffVsKit
check("kit-less state would have thrown in diffVsKit (the bug the guard prevents)", (() => { try { diffVsKit(kitless); return false; } catch { return true; } })());
// a state whose locked root exists but under the WRONG id is also corrupt
const wrongKitId = serialize({ ...kitless, versions: [{ ...kitless.versions[0], id: "sv-orphan", parent_id: null, locked: true }] });
check("deserialize rejects a locked root whose id is not the kit id", !deserialize(wrongKitId, template.template_id).ok);

// FIX 3: duplicate version ids are corruption (forged version shadows the real one)
const dupRaw = serialize({ ...s, versions: [...s.versions, s.versions[0]] });
check("deserialize rejects duplicate version ids", !deserialize(dupRaw, template.template_id).ok && (deserialize(dupRaw, template.template_id) as { reason: string }).reason === "corrupt");

// freezeHistory helper is idempotent and leaves the draft alone
const ih = freezeHistory(initSheets(template, T0));
check("freezeHistory freezes versions + kit values, leaves draft mutable", Object.isFrozen(ih.versions) && Object.isFrozen(ih.versions[0].values) && !Object.isFrozen(ih.draft));

// diff edge: field present on one side only
check("diff handles one-sided fields", JSON.stringify(diffValues({ a: 1 }, {})) === JSON.stringify([{ field: "a", from: 1, to: undefined }]));

console.log(failures === 0 ? `\nSHEETS: all checks passed` : `\nSHEETS: ${failures} failures`);
if (failures > 0) process.exit(1);
