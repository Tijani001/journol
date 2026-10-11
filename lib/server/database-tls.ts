import type { ConnectionOptions } from "node:tls";

export class DatabaseTlsConfigurationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "DatabaseTlsConfigurationError";
  }
}

/**
 * Builds the TLS settings used for server-side PostgreSQL connections.
 *
 * `DATABASE_SSL_CA_CERT` is optional for providers whose certificate chain is
 * already trusted by Node. When a provider uses a private or self-signed CA,
 * it must contain that provider's root CA in PEM form. Escaped newlines are
 * supported so the value can be stored safely in a deployment environment.
 */
export function getDatabaseTlsConfig(
  environment: Readonly<Record<string, string | undefined>> = process.env,
): ConnectionOptions | undefined {
  if (environment.DATABASE_SSL !== "true") return undefined;

  const rawCa = environment.DATABASE_SSL_CA_CERT?.trim();
  if (!rawCa) {
    return { rejectUnauthorized: true };
  }

  const ca = rawCa.replace(/\\n/g, "\n");
  if (!ca.includes("-----BEGIN CERTIFICATE-----") || !ca.includes("-----END CERTIFICATE-----")) {
    throw new DatabaseTlsConfigurationError(
      "DATABASE_SSL_CA_CERT must contain a PEM-encoded certificate authority.",
    );
  }

  return { ca, rejectUnauthorized: true };
}

export function isCertificateVerificationError(error: unknown): boolean {
  return typeof error === "object" && error !== null && (
    ("code" in error && (error.code === "SELF_SIGNED_CERT_IN_CHAIN" || error.code === "UNABLE_TO_VERIFY_LEAF_SIGNATURE"))
  );
}

export const DATABASE_TLS_CONFIGURATION_GUIDANCE =
  "PostgreSQL TLS certificate verification failed. Download the database CA certificate from Supabase Database Settings → SSL Configuration and set DATABASE_SSL_CA_CERT to that PEM value (with \\n for line breaks). TLS verification remains enabled.";
