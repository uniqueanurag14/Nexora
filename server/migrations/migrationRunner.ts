/**
 * NEXORA ERP — Versioned PostgreSQL Migration Runner (`npm run db:update`)
 *
 * Guarantees:
 * - Tracks applied migrations in `nexora_schema_migrations`.
 * - Applies ONLY unapplied migrations in deterministic version order.
 * - Executes each migration inside a PostgreSQL transaction (BEGIN / COMMIT / ROLLBACK).
 * - Never drops, truncates, or overwrites existing production data.
 * - Safe to re-run repeatedly and fully compatible with databases initialized via `npm run db:init`.
 */

import crypto from 'crypto';
import type pg from 'pg';
import { NEXORA_MIGRATIONS, type MigrationDefinition } from './migrations';

export interface MigrationQueryClient {
  query: (sql: string, params?: any[]) => Promise<{ rows: any[] }>;
  release?: () => void;
}

export interface MigrationPoolLike {
  connect: () => Promise<MigrationQueryClient>;
  query: (sql: string, params?: any[]) => Promise<{ rows: any[] }>;
}

export interface MigrationRunItem {
  version: string;
  name: string;
  status: 'applied' | 'skipped' | 'failed';
  execution_ms: number;
  error?: string;
}

export interface MigrationRunSummary {
  total: number;
  applied: MigrationRunItem[];
  skipped: MigrationRunItem[];
  failed: MigrationRunItem | null;
  success: boolean;
}

export function computeMigrationChecksum(migration: MigrationDefinition): string {
  const payload = JSON.stringify({
    version: migration.version,
    statements: migration.statements,
  });
  return crypto.createHash('sha256').update(payload).digest('hex');
}

export async function ensureMigrationHistoryTable(pool: MigrationPoolLike): Promise<void> {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS nexora_schema_migrations (
      version VARCHAR(120) PRIMARY KEY,
      name VARCHAR(255) NOT NULL,
      checksum VARCHAR(64) NOT NULL,
      applied_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      execution_ms INT NOT NULL DEFAULT 0
    )
  `);
}

export async function getAppliedMigrationVersions(pool: MigrationPoolLike): Promise<Map<string, { checksum: string; applied_at: string }>> {
  await ensureMigrationHistoryTable(pool);
  const res = await pool.query(
    `SELECT version, checksum, applied_at FROM nexora_schema_migrations ORDER BY version ASC`
  );
  const map = new Map<string, { checksum: string; applied_at: string }>();
  for (const row of res.rows || []) {
    map.set(String(row.version), {
      checksum: String(row.checksum || ''),
      applied_at: row.applied_at ? new Date(row.applied_at).toISOString() : '',
    });
  }
  return map;
}

export async function runPendingMigrations(
  pool: MigrationPoolLike,
  migrations: MigrationDefinition[] = NEXORA_MIGRATIONS,
  logger: { info: (msg: string) => void; error: (msg: string) => void } = {
    info: (m) => console.log(m),
    error: (m) => console.error(m),
  }
): Promise<MigrationRunSummary> {
  await ensureMigrationHistoryTable(pool);
  const appliedMap = await getAppliedMigrationVersions(pool);

  const ordered = [...migrations].sort((a, b) => a.version.localeCompare(b.version));
  const applied: MigrationRunItem[] = [];
  const skipped: MigrationRunItem[] = [];

  for (const migration of ordered) {
    if (appliedMap.has(migration.version)) {
      const item: MigrationRunItem = {
        version: migration.version,
        name: migration.name,
        status: 'skipped',
        execution_ms: 0,
      };
      skipped.push(item);
      logger.info(`[db:update] SKIP    ${migration.version} — ${migration.name} (already applied)`);
      continue;
    }

    const startMs = Date.now();
    const checksum = computeMigrationChecksum(migration);
    const client = await pool.connect();

    try {
      await client.query('BEGIN');
      for (const stmt of migration.statements) {
        const trimmed = stmt.trim();
        if (!trimmed) continue;
        await client.query(trimmed);
      }

      const elapsed = Date.now() - startMs;
      await client.query(
        `INSERT INTO nexora_schema_migrations (version, name, checksum, applied_at, execution_ms)
         VALUES ($1, $2, $3, NOW(), $4)`,
        [migration.version, migration.name, checksum, elapsed]
      );
      await client.query('COMMIT');

      const item: MigrationRunItem = {
        version: migration.version,
        name: migration.name,
        status: 'applied',
        execution_ms: elapsed,
      };
      applied.push(item);
      logger.info(`[db:update] APPLIED ${migration.version} — ${migration.name} (${elapsed}ms)`);
    } catch (err: any) {
      try {
        await client.query('ROLLBACK');
      } catch {
        // Ignore rollback error if connection already closed
      }
      const elapsed = Date.now() - startMs;
      const errMsg = err?.message || String(err);
      const failedItem: MigrationRunItem = {
        version: migration.version,
        name: migration.name,
        status: 'failed',
        execution_ms: elapsed,
        error: errMsg,
      };
      logger.error(`[db:update] FAILED  ${migration.version} — ${migration.name}: ${errMsg}`);
      return {
        total: ordered.length,
        applied,
        skipped,
        failed: failedItem,
        success: false,
      };
    } finally {
      client.release?.();
    }
  }

  return {
    total: ordered.length,
    applied,
    skipped,
    failed: null,
    success: true,
  };
}

export async function runPendingMigrationsWithPgPool(pool: pg.Pool): Promise<MigrationRunSummary> {
  return runPendingMigrations(pool as unknown as MigrationPoolLike);
}
