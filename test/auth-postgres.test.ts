import { afterEach, describe, expect, it, vi } from "vitest";
import type { Pool } from "pg";
import { getCurrentUser, getOrCreateCurrentUser, requireCurrentUser, setIdentityResolverForTesting } from "@/lib/server/auth";
import { InMemoryJournolRepository } from "@/lib/server/repository";
import { PostgresJournolRepository } from "@/lib/server/postgres-repository";

afterEach(() => setIdentityResolverForTesting(null));

describe("authentication boundary", () => {
  it("returns no Journol user for an unauthenticated identity", async () => {
    const repository = new InMemoryJournolRepository();
    setIdentityResolverForTesting(async () => null);
    await expect(getCurrentUser(repository)).resolves.toBeNull();
    await expect(requireCurrentUser(repository)).rejects.toThrow("AUTHENTICATION_REQUIRED");
  });

  it("reuses the existing Journol user for a verified Clerk identity", async () => {
    const repository = new InMemoryJournolRepository();
    const existing = await repository.createUser({ authIssuer: "https://issuer.test", authSubject: "user_123", email: null });
    setIdentityResolverForTesting(async () => ({ issuer: "https://issuer.test", subject: "user_123", email: null }));
    await expect(getOrCreateCurrentUser(repository)).resolves.toMatchObject({ id: existing.id });
  });

  it("creates a Journol user only from a verified identity resolver", async () => {
    const repository = new InMemoryJournolRepository();
    setIdentityResolverForTesting(async () => ({ issuer: "https://issuer.test", subject: "user_456", email: null }));
    const user = await getOrCreateCurrentUser(repository);
    expect(user).toMatchObject({ authIssuer: "https://issuer.test", authSubject: "user_456" });
  });
});

describe("PostgreSQL repository contract", () => {
  it("uses parameterized owner-scoped queries without a database connection", async () => {
    const query = vi.fn().mockResolvedValue({ rows: [] });
    const repository = new PostgresJournolRepository({ query } as unknown as Pool);
    await expect(repository.listInvestigationsForOwner("owner-id")).resolves.toEqual([]);
    expect(query).toHaveBeenCalledWith(
      "SELECT * FROM investigations WHERE owner_user_id = $1 ORDER BY updated_at DESC",
      ["owner-id"],
    );
  });
});
