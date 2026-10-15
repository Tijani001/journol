import { describe, expect, it } from "vitest";
import {
  DatabaseTlsConfigurationError,
  getDatabaseTlsConfig,
  isCertificateVerificationError,
} from "@/lib/server/database-tls";
import { DATABASE_POOL_MAX_PER_INSTANCE, isDatabaseUnavailableError } from "@/lib/server/database";

const certificate = "-----BEGIN CERTIFICATE-----\\ntrusted-ca\\n-----END CERTIFICATE-----";

describe("database TLS configuration", () => {
  it("keeps a small pool while allowing concurrent workflow hydration and research", () => {
    expect(DATABASE_POOL_MAX_PER_INSTANCE).toBe(2);
  });

  it("recognizes a pool checkout timeout without exposing its raw error to users", () => {
    expect(isDatabaseUnavailableError(new Error("timeout exceeded when trying to connect"))).toBe(true);
    expect(isDatabaseUnavailableError({ code: "53300" })).toBe(true);
    expect(isDatabaseUnavailableError({ code: "SELF_SIGNED_CERT_IN_CHAIN" })).toBe(true);
    expect(isDatabaseUnavailableError(new Error("unrelated failure"))).toBe(false);
  });

  it("does not configure TLS for an explicitly local non-TLS connection", () => {
    expect(getDatabaseTlsConfig({ DATABASE_SSL: "false" })).toBeUndefined();
  });

  it("keeps certificate verification enabled when using Node's trusted CA store", () => {
    expect(getDatabaseTlsConfig({ DATABASE_SSL: "true" })).toEqual({ rejectUnauthorized: true });
  });

  it("uses a configured provider CA while retaining full verification", () => {
    expect(getDatabaseTlsConfig({ DATABASE_SSL: "true", DATABASE_SSL_CA_CERT: certificate })).toEqual({
      ca: "-----BEGIN CERTIFICATE-----\ntrusted-ca\n-----END CERTIFICATE-----",
      rejectUnauthorized: true,
    });
  });

  it("rejects malformed CA configuration instead of silently falling back", () => {
    expect(() => getDatabaseTlsConfig({ DATABASE_SSL: "true", DATABASE_SSL_CA_CERT: "not-a-certificate" }))
      .toThrow(DatabaseTlsConfigurationError);
  });

  it("identifies certificate-chain failures without treating arbitrary errors as TLS failures", () => {
    expect(isCertificateVerificationError({ code: "SELF_SIGNED_CERT_IN_CHAIN" })).toBe(true);
    expect(isCertificateVerificationError({ code: "ECONNREFUSED" })).toBe(false);
  });
});
