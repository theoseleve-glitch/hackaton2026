import { addCar, deleteCar, getCar, initGarage, updateCar } from "./garage";
import { carLabels, carSubtitle, powerFromUi, powerLabel, sheetProfile } from "./labels";
import { deserializeGarage, serializeGarage } from "./persist";
import { makeCar, CUSTOM_CHASSIS_ID } from "../../schema/src/cars";
import type { Car, MakeCarInput } from "../../schema/src/cars";

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

/** Mint a schema Car for a custom (registry-less) chassis the way the app does:
 *  identity facts land on Car.custom, power maps via powerFromUi. */
function mintCar(over: Partial<MakeCarInput> & { id?: string } = {}, now = T0): Car {
  const input: MakeCarInput = {
    name: "Race MP11",
    chassis_id: CUSTOM_CHASSIS_ID,
    power_type: "nitro",
    template_id: "kyosho-inferno-mp11",
    drivetrain: "4wd",
    fuel_tank_cc: 125,
    transponder_id: "1234567",
    custom: { brand: "Kyosho", model: "Inferno MP11", category: "buggy", scale: "1/8" },
    ...over,
  };
  const r = makeCar(input, now);
  if (!r.ok) throw new Error(`fixture makeCar failed: ${r.reason}`);
  return r.car;
}

// — power vocab bridge
check("powerFromUi: electric → brushless", powerFromUi("electric") === "brushless");
check("powerFromUi: nitro → nitro", powerFromUi("nitro") === "nitro");
check("powerLabel: brushless → electric", powerLabel({ power_type: "brushless" }) === "electric");

// — state ops
let s = initGarage();
check("initGarage starts empty", s.cars.length === 0);
const car1 = mintCar({}, T0);
s = addCar(s, car1).state;
const car2 = mintCar(
  {
    name: "Club T4",
    template_id: "generic-onroad",
    power_type: "brushless",
    drivetrain: undefined,
    fuel_tank_cc: undefined,
    custom: { brand: "Xray", model: "T4 2025", category: "onroad", scale: "1/10" },
  },
  T1,
);
s = addCar(s, car2).state;
check("addCar appends with unique ids", s.cars.length === 2 && s.cars[0].id !== s.cars[1].id);
check("getCar finds by id", getCar(s, car1.id)?.custom?.model === "Inferno MP11");
check("getCar unknown id is undefined", getCar(s, "nope") === undefined);

const beforeUpdate = s;
s = updateCar(s, car2.id, { notes: "club stock class" });
check("updateCar patches in place, new state", s !== beforeUpdate && s.cars[1].notes === "club stock class");
check("updateCar preserves id/created_at", s.cars[1].id === car2.id && s.cars[1].created_at === T1);
check("updateCar unknown id is a no-op (same reference)", updateCar(s, "nope", { notes: "x" }) === s);

// — labels resolved from Car.custom (no registry in the app)
{
  const labels = carLabels(s.cars[0]);
  check("carLabels: reads brand/model/category/scale off Car.custom", labels.brand === "Kyosho" && labels.scale === "1/8" && labels.category === "buggy");
}

// — subtitle composition
check("subtitle: full typology", carSubtitle(s.cars[0]) === "1/8 nitro buggy · 4WD", carSubtitle(s.cars[0]));
check("subtitle: no drivetrain → no separator", carSubtitle(s.cars[1]) === "1/10 electric onroad", carSubtitle(s.cars[1]));
{
  const tt: Car = { ...s.cars[1], custom: { ...s.cars[1].custom, category: "stadium_truck" }, drivetrain: "2wd" };
  check("subtitle: underscores humanized + 2WD", carSubtitle(tt) === "1/10 electric stadium truck · 2WD", carSubtitle(tt));
}

// — typology label engine (D26)
{
  const p = sheetProfile(s.cars[0]); // nitro Kyosho 1/8 buggy
  check("profile nitro: hides electronics only", p.hidden_sections.includes("electronics") && !p.hidden_sections.includes("engine"));
  check("profile nitro: gearing override", p.label_overrides.gearing === "Clutch bell / Spur");
  check("profile nitro: badges scale+power+category+brand", JSON.stringify(p.badges) === JSON.stringify(["1/8", "NITRO", "BUGGY", "KYOSHO"]), p.badges.join(","));
}
{
  const truck: Car = { ...s.cars[1], custom: { brand: "Schumacher", model: "X", category: "stadium_truck", scale: "1/10" } };
  const p = sheetProfile(truck); // electric 1/10 stadium truck
  check("profile electric: hides engine only", p.hidden_sections.includes("engine") && !p.hidden_sections.includes("electronics"));
  check("profile electric: gearing override", p.label_overrides.gearing === "Pinion / Spur");
  check("profile electric: badges scale+EP+TT, unlisted brand unbadged", JSON.stringify(p.badges) === JSON.stringify(["1/10", "EP", "TT"]), p.badges.join(","));
}
{
  const tekno: Car = { ...s.cars[0], custom: { brand: "TEKNO", model: "EB48", category: "truggy", scale: "1/8" } };
  const p = sheetProfile(tekno);
  check("profile: brand match is case-insensitive", p.badges.includes("TEKNO"));
  check("profile: truggy badge", p.badges.includes("TRUGGY"));
  const mon: Car = { ...s.cars[0], custom: { brand: "X", model: "Y", category: "monster", scale: "1/8" } };
  check("profile: freeform category just gets no badge", !sheetProfile(mon).badges.includes("MONSTER"));
}

// — fuel + B1a fields survive the round-trip
{
  let g = initGarage();
  g = addCar(g, mintCar({ fuel_tank_cc: 12.5 }, T0)).state;
  const rt = deserializeGarage(serializeGarage(g));
  check("fuel_tank_cc survives the round-trip", rt.ok && rt.state.cars[0].fuel_tank_cc === 12.5);
  check("subtitle unchanged by the fuel field", carSubtitle(g.cars[0]) === "1/8 nitro buggy · 4WD");
}

// — persistence (format 3 = schema Car)
const raw = serializeGarage(s);
check("serialize writes format 3", raw.startsWith('{"format":3'));
const round = deserializeGarage(raw);
check("serialize/deserialize round-trips", round.ok && JSON.stringify(round.state) === JSON.stringify(s));
check("corrupt blob refused, not wiped", deserializeGarage("{nope").ok === false);
check("missing required field reads as corrupt", (() => { const r = deserializeGarage(JSON.stringify({ format: 3, state: { cars: [{ id: "c1" }] } })); return !r.ok && r.reason === "corrupt"; })());
check("legacy format-2 preserved as unknown_format (migrate path owns it)", (() => { const r = deserializeGarage(JSON.stringify({ format: 2, state: { cars: [] } })); return !r.ok && r.reason === "unknown_format"; })());

// — delete
s = deleteCar(s, car1.id);
check("deleteCar removes the car", s.cars.length === 1 && s.cars[0].id === car2.id);
check("deleteCar unknown id is a no-op (same reference)", deleteCar(s, "nope") === s);

if (failures > 0) {
  console.error(`\n${failures} garage test(s) failed`);
  process.exit(1);
}
console.log("\nAll garage tests passed");
