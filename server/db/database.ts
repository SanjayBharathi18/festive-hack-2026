import Database from "better-sqlite3";
import { migrate, readMigrations, schemaVersion } from "./migrate.ts";

export type Db = Database.Database;

const migrations = readMigrations(new URL("./migrations/", import.meta.url));
const latestVersion = migrations.length;

export function openDatabase(file: string): Db {
  const db = new Database(file);
  try {
    if (file !== ":memory:") db.pragma("journal_mode = WAL");
    db.pragma("foreign_keys = ON");
    db.pragma("busy_timeout = 5000");
    migrate(db, migrations);
    return db;
  } catch (error) {
    db.close();
    throw error;
  }
}

export function isDatabaseReady(db: Db): boolean {
  try {
    return schemaVersion(db) === latestVersion;
  } catch {
    return false;
  }
}
