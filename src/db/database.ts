import Database from "better-sqlite3";

const db = new Database("audit.db");

db.pragma("journal_mode = WAL");
db.pragma("synchronous = FULL");

type DbInstance = InstanceType<typeof Database>;

export function withDb<T>(fn: (db: DbInstance) => T): T {
  return fn(db);
}
