import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { PDFDocument } from "pdf-lib";

/**
 * D12 reference implementation: fill the manufacturer's AcroForm sheet from
 * setup JSON via the chassis pdf_map. Fill, never redraw.
 */

const HERE = dirname(fileURLToPath(import.meta.url));
const ROOT = join(HERE, "..", "..", "..");

interface PdfMap {
  pdf_source: string;
  text: Record<string, string>;
  checkbox: Record<string, string>;
}

const map = JSON.parse(
  readFileSync(join(ROOT, "packages", "kb", "chassis", "inferno-mp11.pdf-map.json"), "utf8"),
) as PdfMap;

// Demo data — a real session + the engine's recommended change applied (softer front bar)
const values: Record<string, string | number> = {
  "session.driver": "William",
  "session.date": "2026-06-10",
  "session.track_event": "MRT Club Track — practice",
  "parts.engine": "Reds R7 Evoke .21",
  "parts.plug": "Turbo P5",
  "parts.manifold": "2142",
  "parts.muffler": "EFRA 2155",
  "parts.tire": "Pro-Line Buck Shot",
  "parts.tire_compound": "M3",
  "parts.tire_insert": "closed cell",
  "parts.wheel": "white dish",
  "parts.body": "IFB027",
  "parts.fuel": "30%",
  "setup.spur_teeth": "59",
  "setup.clutch_bell_teeth": "16",
  "setup.front_diff_oil": "8000",
  "setup.center_diff_oil": "5000",
  "setup.rear_diff_oil": "3000",
  "setup.shock_type_front": "P (big bore)",
  "setup.shock_type_rear": "P (big bore)",
  "setup.shock_piston_front": "W 1.4x5",
  "setup.shock_piston_rear": "B 1.5x5",
  "setup.front_shock_oil": "450",
  "setup.rear_shock_oil": "400",
  "setup.front_spring": "Navy Blue 9-1.6",
  "setup.rear_spring": "Brown 11-1.6",
  "setup.shock_length_front": "118",
  "setup.shock_length_rear": "131",
  "setup.front_camber": "-1",
  "setup.front_camber_mm": "5",
  "setup.tie_rod_mm": "27",
  "setup.front_sway_bar": "2.2",
  "setup.rear_camber": "-2",
  "setup.rear_camber_mm": "8",
  "setup.wheelbase_front_mm": "0",
  "setup.wheelbase_rear_mm": "3",
  "setup.rear_sway_bar": "2.8",
  "setup.front_ride_height": "27",
  "setup.rear_ride_height": "29",
  "setup.wing_spacer": "0",
  "session.notes":
    "RaceLab: front sway bar 2.3 -> 2.2 per kb-swaybar-front-softer-301 (mid-corner push, green dusty clay) — rated BETTER.",
};

const checks = [
  "setup.diff_gear_front=10/20",
  "setup.diff_gear_center=10/20",
  "setup.diff_gear_rear=10/20",
  "setup.ring_gear_front=43/13",
  "setup.ring_gear_rear=43/13",
  "setup.diff_size_center=small",
  "setup.diff_position_front=low",
  "setup.diff_position_rear=low",
  "setup.wing=plastic",
  "setup.wing_position=front",
];

const doc = await PDFDocument.load(readFileSync(join(ROOT, map.pdf_source)));
const form = doc.getForm();

let filled = 0;
for (const [canonical, fieldName] of Object.entries(map.text)) {
  const value = values[canonical];
  if (value === undefined) continue;
  const field = form.getTextField(fieldName);
  field.setFontSize(7);
  field.setText(String(value));
  filled++;
}
for (const key of checks) {
  const fieldName = map.checkbox[key];
  if (!fieldName) continue;
  form.getCheckBox(fieldName).check();
  filled++;
}

form.flatten(); // bake values in — the exported sheet is a document, not a form

mkdirSync(join(HERE, "..", "out"), { recursive: true });
const outPath = join(HERE, "..", "out", "demo-setup.pdf");
writeFileSync(outPath, await doc.save());
console.log(`filled ${filled} fields → ${outPath}`);
