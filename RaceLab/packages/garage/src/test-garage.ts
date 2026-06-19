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

// — persistence
const raw = serializeGarage(s);
const round = deserializeGarage(raw);
check("serialize/deserialize round-trips", round.ok && JSON.stringify(round.state) === JSON.stringify(s));
check("corrupt blob refused, not wiped", deserializeGarage("{nope").ok === false);
check("missing required field reads as corrupt", (() => { const r = deserializeGarage(JSON.stringify({ format: 1, state: { cars: [{ id: "c1" }] } })); return !r.ok && r.reason === "corrupt"; })());
check("newer format preserved as unknown_format", (() => { const r = deserializeGarage(JSON.stringify({ format: 99, state: { cars: [] } })); return !r.ok && r.reason === "unknown_format"; })());

// — delete
s = deleteCar(s, a1.car.id);
check("deleteCar removes the car", s.cars.length === 1 && s.cars[0].id === a2.car.id);
check("deleteCar unknown id is a no-op (same reference)", deleteCar(s, "nope") === s);

if (failures > 0) {
  console.error(`\n${failures} garage test(s) failed`);
  process.exit(1);
}
console.log("\nAll garage tests passed");
