import "server-only";
import { DatabaseSync } from "node:sqlite";
import { mkdirSync } from "node:fs";
import path from "node:path";
import { COLUMN_MIGRATIONS, SCHEMA } from "./schema";


const globalForDb = globalThis as unknown as { __hubDb?: DatabaseSync };

export function db(): DatabaseSync {
  if (!globalForDb.__hubDb) {
    const dir = process.env.DATA_DIR ?? path.join(process.cwd(), "data");
    mkdirSync(dir, { recursive: true });
    const conn = new DatabaseSync(path.join(dir, "hub.db"));
    conn.exec(SCHEMA);
    migrateColumns(conn);
    globalForDb.__hubDb = conn;
  }
  return globalForDb.__hubDb;
}

export function tx<T>(fn: () => T): T {
  const conn = db();
  conn.exec("BEGIN");
  try {
    const result = fn();
    conn.exec("COMMIT");
    return result;
  } catch (err) {
    conn.exec("ROLLBACK");
    throw err;
  }
}

export function kvGet<T>(key: string): T | null {
  const row = db().prepare("SELECT value FROM kv WHERE key = ?").get(key) as { value: string } | undefined;
  return row ? (JSON.parse(row.value) as T) : null;
}

export function kvSet(key: string, value: unknown) {
  db()
    .prepare("INSERT INTO kv(key, value) VALUES(?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value")
    .run(key, JSON.stringify(value));
}

export function logSync(job: string, ok: boolean, message: string) {
  db().prepare("INSERT INTO sync_log(job, ok, message) VALUES(?, ?, ?)").run(job, ok ? 1 : 0, message.slice(0, 500));
}

export type SyncLogRow = { id: number; job: string; ok: number; message: string; at: string };
export function lastSync(job: string): SyncLogRow | null {
  return (
    (db().prepare("SELECT * FROM sync_log WHERE job = ? ORDER BY id DESC LIMIT 1").get(job) as SyncLogRow | undefined) ??
    null
  );
}

function migrateColumns(conn: DatabaseSync) {
  for (const [table, column, definition] of COLUMN_MIGRATIONS) {
    const cols = conn.prepare(`PRAGMA table_info(${table})`).all() as { name: string }[];
    if (!cols.some((c) => c.name === column)) conn.exec(`ALTER TABLE ${table} ADD COLUMN ${column} ${definition}`);
  }
}
