/**
 * racelab-storage — B2 storage core (D11: local store is the only source of
 * truth; append-only outbox journal; cloud backup is NOT sync).
 *
 * Layers, bottom-up:
 *  - interfaces: injected drivers (KeyValueDriver/SqlExecutor) + the
 *    repository-facing DocStore/AppendLog/StorageAdapter abstraction
 *  - adapters: memory (tests/reference), sqlite (SQL over SqlExecutor),
 *    kv (write-then-swap over KeyValueDriver), expo-sqlite (device glue)
 *  - repos: typed, parse-on-read, quarantine-not-delete repositories whose
 *    every mutation journals into the schema outbox in the same transaction
 *  - migrate: non-destructive lift of the legacy racelab:sheets/:sessions
 *    AsyncStorage blobs into schema entities + idempotent apply
 */

// ── interfaces ───────────────────────────────────────────────────────────────
export type {
  KeyValueDriver,
  SqlValue,
  SqlStatement,
  SqlExecutor,
  StoreFail,
  PutResult,
  DocGetResult,
  DocGetAllResult,
  LogReadResult,
  LastSeqResult,
  DocStore,
  AppendLog,
  DocOp,
  StorageAdapter,
} from "./interfaces";

// ── adapters ─────────────────────────────────────────────────────────────────
export { memoryStorage, memoryKeyValueDriver } from "./memory";
export type { MemoryStorage } from "./memory";
export { SQL, openSqliteStorage } from "./sqlite";
export { openKvStorage } from "./kv";
export { expoSqliteExecutor } from "./expo-sqlite";
export type { ExpoSqliteDatabase } from "./expo-sqlite";

// ── repositories ─────────────────────────────────────────────────────────────
export { COLLECTIONS, openRepos, parseReport, parseDriverProfile } from "./repos";
export type {
  MutResult,
  GetOneResult,
  GetAllResult,
  EntityRepo,
  KeyedDocRepo,
  SingletonRepo,
  OutboxView,
  ReportDoc,
  Repos,
} from "./repos";

// ── migration ────────────────────────────────────────────────────────────────
export {
  LEGACY_SHEETS_PREFIX,
  LEGACY_SESSIONS_PREFIX,
  seededRand,
  migrateLegacyBlobs,
  applyMigration,
} from "./migrate";
export type {
  LiftedEntities,
  MigrationSkip,
  MigrationReport,
  MigrateResult,
  AppliedCounts,
  ApplyResult,
} from "./migrate";
