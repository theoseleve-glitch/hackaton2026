import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { fillSheet, type PdfMap } from "./sheet.js";

/** fillSheet — the importable PDF export core. Loads the real MP11 sheet + map
 *  and exercises the happy path + each per-field failure mode (never throws). */

const HERE = dirname(fileURLToPath(import.meta.url));
const ROOT = join(HERE, "..", "..", "..");

let failures = 0;
function check(label: string, ok: boolean, detail?: string): void {
  if (ok) console.log(`✓ ${label}`);
  else {
    failures++;
    console.log(`✗ ${label}${detail ? ` — ${detail}` : ""}`);
  }
}

const map = JSON.parse(
  readFileSync(join(ROOT, "packages", "kb", "chassis", "inferno-mp11.pdf-map.json"), "utf8"),
) as PdfMap;
const pdfBytes = readFileSync(join(ROOT, map.pdf_source));

// pick a couple of real mapped fields so the happy path is grounded in the sheet
const textKeys = Object.keys(map.text).slice(0, 3);
const checkKeys = Object.keys(map.checkbox).slice(0, 2);

// ── happy path ────────────────────────────────────────────────────────────────
{
  const values: Record<string, string | number> = {};
  for (const k of textKeys) values[k] = "X";
  const r = await fillSheet(pdfBytes, map, values, checkKeys);
  check("happy: fills the provided text + checkbox fields", r.filled === textKeys.length + checkKeys.length, `filled=${r.filled}`);
  check("happy: nothing skipped on valid input", r.skipped.length === 0, JSON.stringify(r.skipped));
  check("happy: returns a real PDF (starts with %PDF)", r.bytes.length > 1000 && Buffer.from(r.bytes.slice(0, 5)).toString() === "%PDF-");
  // pure: same input → same byte length (deterministic save), original bytes untouched
  const r2 = await fillSheet(pdfBytes, map, values, checkKeys);
  check("pure: re-run yields the same filled count (input not mutated)", r2.filled === r.filled);
}

// ── per-field failure modes (the whole-export-abort bug #fill-error-handling) ──
{
  // a drifted text map entry (renamed widget) must be RECORDED, not thrown, and
  // the other fields must still fill
  const driftedMap: PdfMap = {
    ...map,
    text: { ...map.text, "setup.__bogus__": "NoSuchWidget_99999" },
  };
  const values: Record<string, string | number> = { "setup.__bogus__": "Y" };
  for (const k of textKeys) values[k] = "Z";
  const r = await fillSheet(pdfBytes, driftedMap, values, []);
  check(
    "drift: a missing AcroForm field is recorded (missing_field), never thrown",
    r.skipped.some((s) => s.field === "setup.__bogus__" && s.reason === "missing_field"),
    JSON.stringify(r.skipped),
  );
  check("drift: the other valid fields still fill (no whole-export abort)", r.filled === textKeys.length, `filled=${r.filled}`);
}

// ── unknown checkbox option (decorative =value RHS, #checkbox-resolution) ──────
{
  const r = await fillSheet(pdfBytes, map, {}, ["setup.diff_gear_front=999/999"]);
  check(
    "checkbox: an unmapped canonical=value option is reported unknown_checkbox (never a silent default)",
    r.skipped.some((s) => s.field === "setup.diff_gear_front=999/999" && s.reason === "unknown_checkbox"),
    JSON.stringify(r.skipped),
  );
}

// ── flatten:false keeps an editable form ──────────────────────────────────────
{
  const r = await fillSheet(pdfBytes, map, { [textKeys[0]]: "A" }, [], { flatten: false });
  check("opts: flatten:false still returns valid bytes", r.bytes.length > 1000 && r.filled === 1);
}

console.log(failures === 0 ? "\nPDF: all fillSheet tests passed" : `\nPDF: ${failures} failures`);
if (failures > 0) process.exit(1);
