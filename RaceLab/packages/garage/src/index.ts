/** RaceLab garage — public API (D26). Multi-car garage entities + the
 *  typology label engine that customizes a sheet per car (hide sections,
 *  override labels, badge the header). Pure data + pure functions: no fs,
 *  no network, no node built-ins — bundles into the app unchanged. */
export { initGarage, addCar, updateCar, deleteCar, getCar, carSubtitle } from "./garage";
export { sheetProfile, templateIdForCar, templateIdOnSave } from "./labels";
export type { SheetProfile, CarTypology } from "./labels";
export { serializeGarage, deserializeGarage, GARAGE_FORMAT_VERSION } from "./persist";
export type { DeserializeGarageResult } from "./persist";
export type { CarEntity, GarageState, PowerType } from "./types";
