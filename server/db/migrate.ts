import { readdirSync, readFileSync } from "node:fs";
import type Database from "better-sqlite3";

export type Migration = { version: number; name: string; sql: string };

export function readMigrations(folder: URL): Migration[] {
  const migrations = readdirSync(folder)
    .filter((file) => file.endsWith(".sql"))
    .map((file) => {
      const version = /^(\d+)-[\w-]+\.sql$/.exec(file)?.[1];
      if (version === undefined) {
        throw new Error(
          `The migration ${file} must be named like 002-orders-index.sql.`,
        );
      }
      const sql = readFileSync(new URL(file, folder), "utf8");
      return { version: Number(version), name: file, sql };
    })
    .sort((a, b) => a.version - b.version);
  migrations.forEach((migration, index) => {
    if (migration.version !== index + 1) {
      throw new Error(
        `The migration ${migration.name} must have the number ${index + 1}: numbers start at 1, with no gaps or repeats.`,
      );
    }
  });
  return migrations;
}

export function migrate(db: Database.Database, migrations: Migration[]): void {
  const current = schemaVersion(db);
  const latest = migrations.at(-1)?.version ?? 0;
  if (current > latest) {
    throw new Error(
      `The database has schema version ${current}, but this code knows versions up to ${latest}. Run the newer code.`,
    );
  }
  for (const migration of migrations) {
    if (migration.version <= current) continue;
    // Off before the transaction (inside it the pragma does nothing), so that
    // a table rebuild does not cascade and delete the child rows.
    const foreignKeys = Number(db.pragma("foreign_keys", { simple: true }));
    db.pragma("foreign_keys = OFF");
    try {
      db.transaction(() => {
        db.exec(migration.sql);
        const broken = db.pragma("foreign_key_check") as { table: string }[];
        if (broken.length > 0) {
          throw new Error(
            `The migration ${migration.name} breaks foreign keys: ${broken[0]?.table} has rows with no parent (${broken.length} in all).`,
          );
        }
        db.pragma(`user_version = ${migration.version}`);
      })();
    } finally {
      db.pragma(`foreign_keys = ${foreignKeys === 1 ? "ON" : "OFF"}`);
    }
  }
}

export function schemaVersion(db: Database.Database): number {
  return Number(db.pragma("user_version", { simple: true }));
}
