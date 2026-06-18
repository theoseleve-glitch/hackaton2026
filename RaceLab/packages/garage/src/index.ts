/** RaceLab garage — public API (D26), now schema-backed. Multi-car garage over
 *  the canonical schema `Car` + the typology label engine that customizes a
 *  sheet per car (hide sections, override labels, badge the header). Pure data
 *  + pure functions: no fs, no network, no node built-ins. */
export { initGarage, addCar, updateCar, deleteCar, getCar } from "./garage";
export {
  sheetProfile,
  carSubtitle,
  carLabels,
  powerLabel,
  powerFromUi,
} from "./labels";
export type { SheetProfile, CarLabels } from "./labels";
export { serializeGarage, deserializeGarage, GARAGE_FORMAT_VERSION } from "./persist";
export type { DeserializeGarageResult } from "./persist";
export type { CarEntity, GarageState, PowerType } from "./types";
// Re-export the schema Car + maker so consumers have one import site.
export type { Car, MakeCarInput, ChassisRegistryEntry } from "../../schema/src/cars";
export { makeCar, CUSTOM_CHASSIS_ID, classLabels } from "../../schema/src/cars";
