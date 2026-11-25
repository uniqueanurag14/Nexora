#!/usr/bin/env tsx
/**
 * NEXORA ERP — Versioned PostgreSQL Migration Command (`npm run db:update`)
 *
 * Inspects `nexora_schema_migrations` in PostgreSQL, applies ONLY unapplied
 * schema migrations inside transactions, preserves 100% of existing data,
 * and inserts ZERO seed or dummy data.
 */

import dotenv from 'dotenv';
dotenv.config();

import pg from 'pg';
import { runtimeConfig } from '../server/config/runtimeConfig';
import { runPendingMigrationsWithPgPool } from '../server/migrations/migrationRunner';

async function main() {
  const databaseUrl = runtimeConfig.databaseUrl || process.env.DATABASE_URL || '';
  if (!databaseUrl) {
    console.error('[db:update] ERROR: DATABASE_URL is not configured in .env.');
    console.error('[db:update] Please configure PostgreSQL DATABASE_URL and re-run: npm run db:update');
    process.exit(1);
  }

  const pool = new pg.Pool({
    connectionString: databaseUrl,
    max: 4,
    connectionTimeoutMillis: runtimeConfig.pgConnectionTimeoutMs,
    idleTimeoutMillis: runtimeConfig.pgIdleTimeoutMs,
    statement_timeout: runtimeConfig.pgStatementTimeoutMs,
    ssl: runtimeConfig.pgSsl,
  });

  try {
    console.log('[db:update] Connecting to PostgreSQL...');
    const client = await pool.connect();
    try {
      const infoRes = await client.query(
        'SELECT current_database() AS db, current_user AS usr, version() AS pg_ver'
      );
      const info = infoRes.rows[0];
      console.log(
        `[db:update] Connected to database "${info?.db}" as "${info?.usr}".`
      );
    } finally {
      client.release();
    }

    console.log('[db:update] Checking versioned migrations (DDL-only, zero seed data)...');
    const summary = await runPendingMigrationsWithPgPool(pool);

    console.log('');
    console.log('=== NEXORA PostgreSQL Migration Summary ===');
    console.log(`Total migrations registered : ${summary.total}`);
    console.log(`Newly applied               : ${summary.applied.length}`);
    console.log(`Already applied (skipped)   : ${summary.skipped.length}`);
    console.log(`Final status                : ${summary.success ? 'SUCCESS' : 'FAILED'}`);

    if (!summary.success && summary.failed) {
      console.error(
        `Failed migration            : ${summary.failed.version} (${summary.failed.error || 'Unknown error'})`
      );
      process.exitCode = 1;
      return;
    }

    const tablesRes = await pool.query(
      `SELECT COUNT(*)::int AS cnt FROM information_schema.tables WHERE table_schema = 'public'`
    );
    console.log(`Public PostgreSQL tables    : ${tablesRes.rows[0]?.cnt ?? 0}`);
  } catch (err: any) {
    console.error('[db:update] ERROR:', err?.message || err);
    process.exitCode = 1;
  } finally {
    await pool.end().catch(() => {});
  }
}

main();
