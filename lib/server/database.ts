import "server-only";

import { Pool, type PoolConfig } from "pg";
import { getDatabaseTlsConfig } from "@/lib/server/database-tls";

export class DatabaseConfigurationError extends Error {
  constructor() {
    super("DATABASE_NOT_CONFIGURED");
  }
}

// A single connection is easily exhausted by the concurrent, account-scoped
// reads that hydrate an investigation while the journalist starts research.
// Two remains deliberately conservative for Supabase's pooled connection
// limits while allowing one request to make progress if another is finishing.
export const DATABASE_POOL_MAX_PER_INSTANCE = 2;

/** Safe classification for connection-pool and transient PostgreSQL failures. */
export function isDatabaseUnavailableError(error: unknown): boolean {
  if (!error || typeof error !== "object") return false;
  const candidate = error as { code?: unknown; message?: unknown };
  const code = typeof candidate.code === "string" ? candidate.code : "";
  const message = typeof candidate.message === "string" ? candidate.message : "";
  return ["ETIMEDOUT", "ECONNREFUSED", "ECONNRESET", "ENOTFOUND", "53300", "57P01", "57014", "SELF_SIGNED_CERT_IN_CHAIN", "UNABLE_TO_VERIFY_LEAF_SIGNATURE", "CERT_HAS_EXPIRED"].includes(code)
    || /timeout exceeded when trying to connect|connection terminated unexpectedly/i.test(message);
}

export function isDatabaseConfigured(): boolean {
  return Boolean(process.env.DATABASE_URL?.trim());
}

function databaseConfig(): PoolConfig {
  const connectionString = process.env.DATABASE_URL?.trim();
  if (!connectionString) throw new DatabaseConfigurationError();

  return {
    connectionString,
    // Supabase requires TLS for its hosted connection strings. Local Postgres
    // can omit DATABASE_SSL entirely. Production always verifies the
    // certificate; a provider CA can be supplied through DATABASE_SSL_CA_CERT.
    ssl: getDatabaseTlsConfig(),
    max: DATABASE_POOL_MAX_PER_INSTANCE,
    idleTimeoutMillis: 10_000,
    connectionTimeoutMillis: 10_000,
  };
}

declare global {
  var __journolPostgresPool: Pool | undefined;
}

export function getDatabasePool(): Pool {
  if (!global.__journolPostgresPool) {
    global.__journolPostgresPool = new Pool(databaseConfig());
  }
  return global.__journolPostgresPool;
}
