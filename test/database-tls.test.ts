import { describe, expect, it } from "vitest";
import {
  DatabaseTlsConfigurationError,
  getDatabaseTlsConfig,
  isCertificateVerificationError,
} from "@/lib/server/database-tls";

const certificate = "-----BEGIN CERTIFICATE-----\\ntrusted-ca\\n-----END CERTIFICATE-----";

describe("database TLS configuration", () => {
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
