// Assemble packages/kb/chassis/registry.json from the competitive-scene research
// files (docs/research/competitive-scene/g*.json). Idempotent + deterministic:
// existing entries are preserved by chassis_id; research rows are normalised,
// deduped, and appended. Run: node scripts/assemble-registry.mjs
//
// Grounding rule: a research row with no `sources` is dropped (no source → no
// entry). category/type are derived canonically so cross-agent drift can't leak.
import { readFileSync, writeFileSync, readdirSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const RESEARCH = join(ROOT, "docs/research/competitive-scene");
const REGISTRY = join(ROOT, "packages/kb/chassis/registry.json");

// ── canonical taxonomy ───────────────────────────────────────────────────────
const ONROAD_TYPES = new Set(["gt", "touring", "pan", "f1"]);
const OFFROAD_TYPES = new Set(["buggy", "truggy", "short_course", "stadium_truck", "monster_truck", "crawler", "rally"]);
const FACET_SCALES = new Set(["1/8", "1/10", "1/12", "1/5"]);
const POWER = new Set(["nitro", "brushless"]);

function categoryFor(type) {
  if (ONROAD_TYPES.has(type)) return "onroad";
  if (OFFROAD_TYPES.has(type)) return "offroad";
  return null; // unknown type → caller drops the row
}

// (category, scale, type, power, notes) → category template id
function templateFor(scale, type, power, notes) {
  const n = (notes || "").toLowerCase();
  if (scale === "1/5") return "large_scale_1_5";
  if (type === "crawler") return "crawler";
  if (type === "monster_truck") return "monster_truck";
  if (type === "rally") return "rally";
  if (type === "f1") return "f1";
  if (type === "pan") return "1_12_pan";
  if (type === "gt") return "1_8_gt";
  if (type === "truggy") return "1_8_truggy";
  if (type === "short_course") return "short_course";
  if (type === "stadium_truck") return "stadium_truck";
  if (type === "touring") return power === "nitro" ? "1_10_nitro_onroad" : "1_10_touring_electric";
  if (type === "buggy") {
    if (scale === "1/8") return power === "nitro" ? "1_8_offroad_nitro" : "1_8_offroad_electric";
    if (scale === "1/10") return /\b4wd\b/.test(n) ? "1_10_offroad_4wd" : "1_10_offroad_2wd";
  }
  return null;
}

// ── slugging (matches the existing registry convention) ──────────────────────
function brandSlug(brand) {
  let b = brand.toLowerCase().trim();
  const map = {
    "team associated": "associated",
    "team losi racing": "tlr",
    "tlr": "tlr",
    "losi": "losi",
    "mugen seiki": "mugen",
    "hb racing": "hb",
    "hot bodies": "hb",
    "sparko racing": "sparko",
    "team durango": "durango",
    "team magic": "team-magic",
    "pro-line": "proline",
    "pro line": "proline",
    "fg modellsport": "fg",
    "element rc": "element",
    "vanquish products": "vanquish",
  };
  if (map[b]) return map[b];
  b = b.replace(/\bracing\b/g, "").replace(/\bseiki\b/g, "").replace(/\bproducts\b/g, "").replace(/\bmodellsport\b/g, "").replace(/\badventure\b/g, "");
  b = b.replace(/^team\s+/, "");
  return slug(b);
}
function slug(s) {
  return s.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "");
}

// ── load existing registry (preserve; backfill category_template on non-full) ─
const existing = JSON.parse(readFileSync(REGISTRY, "utf8"));
let backfilled = 0;
for (const e of existing) {
  if (e.template_status !== "full" && !e.category_template) {
    const t = templateFor(e.scale, e.type, e.default_power_type, "");
    if (t) { e.category_template = t; backfilled++; }
  }
}
const byId = new Map(existing.map((e) => [e.chassis_id, e]));
const order = existing.map((e) => e.chassis_id);

// ── ingest research files ────────────────────────────────────────────────────
const files = readdirSync(RESEARCH).filter((f) => /^g\d.*\.json$/.test(f)).sort();
let dropped = [];
let added = 0;
const fresh = [];
for (const f of files) {
  const rows = JSON.parse(readFileSync(join(RESEARCH, f), "utf8"));
  for (const r of rows) {
    const type = String(r.type || "").trim();
    const scale = String(r.scale || "").trim();
    const power = String(r.default_power_type || "").trim();
    const category = categoryFor(type);
    const tmpl = templateFor(scale, type, power, r.notes);
    const sources = Array.isArray(r.sources) ? r.sources.filter(Boolean) : [];
    // validation gates (grounding + vocab)
    if (!r.brand || !r.model) { dropped.push([f, r.model, "no brand/model"]); continue; }
    if (sources.length === 0) { dropped.push([f, `${r.brand} ${r.model}`, "no source"]); continue; }
    if (!category) { dropped.push([f, `${r.brand} ${r.model}`, `bad type ${type}`]); continue; }
    if (!FACET_SCALES.has(scale)) { dropped.push([f, `${r.brand} ${r.model}`, `bad scale ${scale}`]); continue; }
    if (!tmpl) { dropped.push([f, `${r.brand} ${r.model}`, `no template ${scale}/${type}`]); continue; }
    let powers = Array.isArray(r.power_types) ? r.power_types.filter((p) => POWER.has(p)) : [];
    if (!POWER.has(power)) { dropped.push([f, `${r.brand} ${r.model}`, `bad power ${power}`]); continue; }
    if (!powers.includes(power)) powers = [power, ...powers];
    powers = [...new Set(powers)];

    const chassis_id = `${brandSlug(r.brand)}-${slug(r.model)}`;
    if (byId.has(chassis_id)) { dropped.push([f, chassis_id, "dup (already in registry)"]); continue; }

    const provBits = [];
    if (r.notable_results) provBits.push(String(r.notable_results).trim());
    provBits.push(`sources: ${sources.join(" ; ")}`);
    const entry = {
      chassis_id,
      template_id: chassis_id,
      brand: r.brand,
      model: r.model,
      category,
      scale,
      type,
      default_power_type: power,
      power_types: powers,
      template_status: "pending_pdf",
      category_template: tmpl,
    };
    if (r.manual_url) entry.manual_url = r.manual_url;
    if (r.setup_sheet_url) entry.setup_sheet_url = r.setup_sheet_url;
    entry.provenance = provBits.join(" | ").slice(0, 600);

    byId.set(chassis_id, entry);
    order.push(chassis_id);
    fresh.push(entry);
    added++;
  }
}

const out = order.map((id) => byId.get(id));
writeFileSync(REGISTRY, JSON.stringify(out, null, 2) + "\n");

// ── report ───────────────────────────────────────────────────────────────────
console.log(`registry: ${existing.length} existing (${backfilled} backfilled) + ${added} new = ${out.length} total`);
const byTmpl = {};
for (const e of out) { const k = e.category_template || `(full:${e.template_file})`; byTmpl[k] = (byTmpl[k] || 0) + 1; }
console.log("by setup-page template:");
for (const [k, v] of Object.entries(byTmpl).sort((a, b) => b[1] - a[1])) console.log(`  ${String(v).padStart(3)}  ${k}`);
console.log(`dropped ${dropped.length} rows:`);
for (const [f, m, why] of dropped) console.log(`  [${f}] ${m} — ${why}`);
