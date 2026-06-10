import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import type { ChassisTemplate } from "../../engine/src/types";
import {
  initSheets,
  kitVersionId,
  loadVersion,
  renameVersion,
  saveVersion,
  setValue,
  toggleStar,
} from "./sheets";
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
s = save1.state;
check("saveVersion appends with parent = old base", save1.saved !== null && save1.saved.parent_id === KIT && s.versions.length === 2);
check("draft rebased onto the new version (diff now empty)", s.draft_base_id === save1.saved!.id && draftDiff(s).length === 0);
check("saving identical values is a no-op even with a new name", saveVersion(s, T2, "fancy new name").saved === null);
check("saved versions are deep-frozen", Object.isFrozen(save1.saved) && Object.isFrozen(save1.saved!.values));
check("mutating a saved version's values throws", (() => { try { (save1.saved!.values as Record<string, number>).front_sway_bar = 9; return false; } catch { return true; } })());

// second change + save → lineage chain; version-vs-version diff; unique ids
s = setValue(s, "rear_diff_oil", 4000);
const save2 = saveVersion(s, T2, "Thicker rear diff");
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

// diff edge: field present on one side only
check("diff handles one-sided fields", JSON.stringify(diffValues({ a: 1 }, {})) === JSON.stringify([{ field: "a", from: 1, to: undefined }]));

console.log(failures === 0 ? `\nSHEETS: all checks passed` : `\nSHEETS: ${failures} failures`);
if (failures > 0) process.exit(1);
