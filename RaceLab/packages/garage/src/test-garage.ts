import { addCar, carSubtitle, deleteCar, getCar, initGarage, updateCar } from "./garage";
import { sheetProfile } from "./labels";
import { deserializeGarage, serializeGarage } from "./persist";
import type { CarEntity } from "./types";

let failures = 0;
function check(label: string, ok: boolean, detail?: string): void {
  if (ok) {
    console.log(`✓ ${label}`);
  } else {
    failures++;
    console.log(`✗ ${label}${detail ? ` — ${detail}` : ""}`);
  }
}

const T0 = "2026-06-11T09:00:00.000Z";
const T1 = "2026-06-11T10:00:00.000Z";

function carFixture(over: Partial<Omit<CarEntity, "id">> = {}): Omit<CarEntity, "id"> {
  return {
    created_at: T0,
    name: "Race MP11",
    template_id: "kyosho-inferno-mp11",
    brand: "Kyosho",
    model: "Inferno MP11",
    category: "buggy",
    scale: "1/8",
    drivetrain: "4wd",
    power: "nitro",
    engine: "Reds R7 Evo",
    fuel_tank_cc: 125,
    transponder: "1234567",
    ...over,
  };
}

// — state ops
let s = initGarage();
check("initGarage starts empty", s.cars.length === 0);
const a1 = addCar(s, carFixture(), T0);
s = a1.state;
const a2 = addCar(
  s,
  carFixture({
    created_at: T1,
    name: "Club T4",
    template_id: "generic-onroad",
    brand: "Xray",
    model: "T4 2025",
    category: "onroad",
    scale: "1/10",
    drivetrain: undefined,
    power: "electric",
    engine: undefined,
    fuel_tank_cc: undefined,
    motor: "Hobbywing 13.5T",
    esc: "XR10 Pro",
    battery: "LiPo 2S shorty",
  }),
  T1,
);
s = a2.state;
check("addCar appends chronologically with unique ids", s.cars.length === 2 && s.cars[0].id !== s.cars[1].id);
check("addCar returns the minted car", a2.car.name === "Club T4" && s.cars[1].id === a2.car.id);
check("getCar finds by id", getCar(s, a1.car.id)?.model === "Inferno MP11");
check("getCar unknown id is undefined", getCar(s, "nope") === undefined);

const beforeUpdate = s;
s = updateCar(s, a2.car.id, { motor: "Hobbywing 10.5T", notes: "club stock class" });
check("updateCar patches in place, new state", s !== beforeUpdate && s.cars[1].motor === "Hobbywing 10.5T");
check("updateCar preserves id/created_at", s.cars[1].id === a2.car.id && s.cars[1].created_at === T1);
check("updateCar unknown id is a no-op (same reference)", updateCar(s, "nope", { notes: "x" }) === s);

// — subtitle composition
check("subtitle: full typology", carSubtitle(s.cars[0]) === "1/8 nitro buggy · 4WD", carSubtitle(s.cars[0]));
check("subtitle: no drivetrain → no separator", carSubtitle(s.cars[1]) === "1/10 electric onroad", carSubtitle(s.cars[1]));
{
  const tt = { ...s.cars[1], category: "stadium_truck", drivetrain: "2wd" as const };
  check("subtitle: underscores humanized + 2WD", carSubtitle(tt) === "1/10 electric stadium truck · 2WD", carSubtitle(tt));
  const bare = { ...s.cars[1], scale: "", category: "" };
  check("subtitle: missing parts skipped", carSubtitle(bare) === "electric", carSubtitle(bare));
}

// — typology label engine (D26)
{
  const p = sheetProfile(s.cars[0]); // nitro Kyosho 1/8 buggy
  check("profile nitro: hides electronics only", p.hidden_sections.includes("electronics") && !p.hidden_sections.includes("engine"));
  check("profile nitro: gearing override", p.label_overrides.gearing === "Clutch bell / Spur");
  check("profile nitro: badges scale+power+category+brand", JSON.stringify(p.badges) === JSON.stringify(["1/8", "NITRO", "BUGGY", "KYOSHO"]), p.badges.join(","));
}
{
  const truck = { ...s.cars[1], brand: "Schumacher", category: "stadium_truck" };
  const p = sheetProfile(truck); // electric 1/10 stadium truck
  check("profile electric: hides engine only", p.hidden_sections.includes("engine") && !p.hidden_sections.includes("electronics"));
  check("profile electric: gearing override", p.label_overrides.gearing === "Pinion / Spur");
  check("profile electric: badges scale+EP+TT, unlisted brand unbadged", JSON.stringify(p.badges) === JSON.stringify(["1/10", "EP", "TT"]), p.badges.join(","));
}
{
  const p = sheetProfile({ ...s.cars[0], brand: "TEKNO", category: "truggy" });
  check("profile: brand match is case-insensitive", p.badges.includes("TEKNO"));
  check("profile: truggy badge", p.badges.includes("TRUGGY"));
  check("profile: freeform category just gets no badge", !sheetProfile({ ...s.cars[0], category: "monster" }).badges.includes("MONSTER"));
}

// — v2 fuel unit: fuel_tank_cl round-trips; carSubtitle untouched by fuel fields
{
  let g = initGarage();
  g = addCar(g, carFixture({ fuel_tank_cc: undefined, fuel_tank_cl: 12.5 }), T0).state;
  const rt = deserializeGarage(serializeGarage(g));
  check("v2: fuel_tank_cl survives the round-trip", rt.ok && rt.state.cars[0].fuel_tank_cl === 12.5);
  check("v2: subtitle unchanged by the fuel unit", carSubtitle(g.cars[0]) === "1/8 nitro buggy · 4WD");
}

// — format-1 migration: cc → cL (the pilot's unit), cc dropped, never corruption
{
  const v1raw =
    '{"format":1,"state":{"cars":[{"id":"car-old","name":"Race MP11","template_id":"kyosho-inferno-mp11","brand":"Kyosho","model":"Inferno MP11","category":"buggy","scale":"1/8","power":"nitro","fuel_tank_cc":125,"created_at":"2026-05-01T10:00:00.000Z"},{"id":"car-ep","name":"Club T4","template_id":"generic-onroad","brand":"Xray","model":"T4 2025","category":"onroad","scale":"1/10","power":"electric","created_at":"2026-05-02T10:00:00.000Z"}]}}';
  const m = deserializeGarage(v1raw);
  check("format-1 envelope migrates clean (never corruption)", m.ok);
  check(
    "format-1: fuel_tank_cc 125 becomes fuel_tank_cl 12.5",
    m.ok && m.state.cars[0].fuel_tank_cl === 12.5,
  );
  check(
    "format-1: fuel_tank_cc removed from the migrated object",
    m.ok && !("fuel_tank_cc" in m.state.cars[0]),
  );
  check(
    "format-1: car without a tank passes through untouched",
    m.ok && m.state.cars[1].fuel_tank_cl === undefined && !("fuel_tank_cc" in m.state.cars[1]),
  );
  const odd = deserializeGarage(v1raw.replace('"fuel_tank_cc":125', '"fuel_tank_cc":123'));
  check("format-1: cc → cL rounds to 1 decimal", odd.ok && odd.state.cars[0].fuel_tank_cl === 12.3);
}

// — persistence
const raw = serializeGarage(s);
check("serialize writes format 2", raw.startsWith('{"format":2'));
const round = deserializeGarage(raw);
check("serialize/deserialize round-trips", round.ok && JSON.stringify(round.state) === JSON.stringify(s));
check("corrupt blob refused, not wiped", deserializeGarage("{nope").ok === false);
check("missing required field reads as corrupt", (() => { const r = deserializeGarage(JSON.stringify({ format: 1, state: { cars: [{ id: "c1" }] } })); return !r.ok && r.reason === "corrupt"; })());
check("newer format preserved as unknown_format", (() => { const r = deserializeGarage(JSON.stringify({ format: 99, state: { cars: [] } })); return !r.ok && r.reason === "unknown_format"; })());

// — delete
s = deleteCar(s, a1.car.id);
check("deleteCar removes the car", s.cars.length === 1 && s.cars[0].id === a2.car.id);
check("deleteCar unknown id is a no-op (same reference)", deleteCar(s, "nope") === s);

// — templateIdForCar: typology → resolvable KB template id (P1 fix) ────────────
// Cross-check every output against the REAL bundled KB so a typo or a renamed
// category template fails here, not silently in the app.
import { templateIdForCar } from "./labels";
import bundle from "../../kb/bundle.json";
const RESOLVABLE = new Set<string>([
  ...Object.keys((bundle as { templates?: Record<string, unknown> }).templates ?? {}),
  ...Object.keys((bundle as { categoryTemplates?: Record<string, unknown> }).categoryTemplates ?? {}),
]);
const tplCar = (over: Partial<CarEntity>): Pick<CarEntity, "brand" | "model" | "category" | "scale" | "power" | "drivetrain"> => ({
  brand: "Generic", model: "X", category: "buggy", scale: "1/8", power: "nitro", drivetrain: "4wd", ...over,
});

const cases: { label: string; car: Partial<CarEntity>; expect: string }[] = [
  { label: "MP11 keeps its full per-model template", car: { brand: "Kyosho", model: "Inferno MP11" }, expect: "kyosho-inferno-mp11" },
  { label: "on-road 1/10 electric → touring (NOT off-road)", car: { category: "onroad", scale: "1/10", power: "electric" }, expect: "1_10_touring_electric" },
  { label: "on-road 1/10 nitro → nitro on-road", car: { category: "onroad", scale: "1/10", power: "nitro" }, expect: "1_10_nitro_onroad" },
  { label: "on-road 1/8 → GT", car: { category: "onroad", scale: "1/8" }, expect: "1_8_gt" },
  { label: "on-road 1/12 → pan", car: { category: "onroad", scale: "1/12" }, expect: "1_12_pan" },
  { label: "1/8 nitro buggy → 1/8 off-road nitro", car: { category: "buggy", scale: "1/8", power: "nitro" }, expect: "1_8_offroad_nitro" },
  { label: "1/8 electric buggy → 1/8 off-road electric", car: { category: "buggy", scale: "1/8", power: "electric" }, expect: "1_8_offroad_electric" },
  { label: "1/10 2wd buggy → 1/10 2wd off-road", car: { category: "buggy", scale: "1/10", drivetrain: "2wd" }, expect: "1_10_offroad_2wd" },
  { label: "1/10 4wd buggy → 1/10 4wd off-road", car: { category: "buggy", scale: "1/10", drivetrain: "4wd" }, expect: "1_10_offroad_4wd" },
  // REGRESSION GUARD: drivetrain UNSET must NOT route to 4WD (phantom centre/front
  // diff advice on a likely-2WD car). Unknown → 2WD scaffold (no phantom diffs).
  { label: "1/10 buggy, drivetrain UNSET → 2WD (never phantom 4WD diffs)", car: { category: "buggy", scale: "1/10", drivetrain: undefined }, expect: "1_10_offroad_2wd" },
  { label: "truggy → 1/8 truggy", car: { category: "truggy" }, expect: "1_8_truggy" },
  { label: "stadium_truck → stadium truck", car: { category: "stadium_truck", scale: "1/10" }, expect: "stadium_truck" },
  { label: "sc → short course", car: { category: "sc", scale: "1/10" }, expect: "short_course" },
  { label: "1/5 → large scale (own scaffold)", car: { category: "onroad", scale: "1/5" }, expect: "large_scale_1_5" },
  // freeform categories must hit their OWN (zero-rule → clean refusal) template,
  // never borrow off-road buggy rules.
  { label: "crawler → crawler template", car: { category: "crawler", scale: "1/10" }, expect: "crawler" },
  { label: "f1 → f1 template", car: { category: "f1", scale: "1/10" }, expect: "f1" },
  { label: "rally → rally template", car: { category: "rally", scale: "1/10" }, expect: "rally" },
  // an Inferno *GT* is on-road — the mp11 brand match must NOT override the category
  { label: "Kyosho Inferno GT (on-road) → on-road template, NOT off-road MP11", car: { brand: "Kyosho", model: "Inferno GT3", category: "onroad", scale: "1/8" }, expect: "1_8_gt" },
];
for (const c of cases) {
  const got = templateIdForCar(tplCar(c.car));
  check(`templateIdForCar: ${c.label}`, got === c.expect, `got ${got}`);
  check(`templateIdForCar: ${c.expect} resolves in the bundled KB`, RESOLVABLE.has(got), `${got} not in bundle`);
}
// the headline invariant: an on-road car must NEVER be routed to the off-road generic
for (const scale of ["1/8", "1/10", "1/12", "1/5"]) {
  for (const power of ["nitro", "electric"] as const) {
    const got = templateIdForCar(tplCar({ category: "onroad", scale, power }));
    check(`on-road ${scale}/${power} is never generic-offroad`, got !== "generic-offroad", got);
    check(`on-road ${scale}/${power} resolves in the bundle`, RESOLVABLE.has(got), got);
  }
}

if (failures > 0) {
  console.error(`\n${failures} garage test(s) failed`);
  process.exit(1);
}
console.log("\nAll garage tests passed");
