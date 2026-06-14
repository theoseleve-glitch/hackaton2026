/** RaceLab sheets — public API (D21). Pure data + pure functions: immutable
 *  saved versions, one mutable draft branched from a base, computed diffs. */
export {
  initSheets,
  setValue,
  toggleStar,
  saveVersion,
  renameVersion,
  loadVersion,
  renameDraft,
  getVersion,
  kitSetup,
  kitVersionId,
} from "./sheets";
export { diffValues, draftDiff, diffVersions, diffVsKit } from "./diff";
export { serialize, deserialize, FORMAT_VERSION } from "./persist";
export type { SetupValues, SetupVersion, SheetsState, SaveResult } from "./sheets";
export type { ChangedField } from "./diff";
export type { DeserializeResult } from "./persist";
