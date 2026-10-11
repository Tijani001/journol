import "server-only";

import { Pool, type PoolConfig } from "pg";
import { getDatabaseTlsConfig } from "@/lib/server/database-tls";

export class DatabaseConfigurationError extends Error {
  constructor() {
    super("DATABASE_NOT_CONFIGURED");
  }
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
    max: 1,
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
