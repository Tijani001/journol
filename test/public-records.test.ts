import { describe, expect, it, vi } from "vitest";
import { parseCacRegistrationNumber } from "@/lib/public-record-types";
import { InMemoryJournolRepository } from "@/lib/server/repository";
import { procurementResult, searchPublicRecords } from "@/lib/server/public-records";
import type { ProcurementAward } from "@/lib/domain/types";

const award: ProcurementAward = {
  ocid: "ocds-nigeria-1", awardId: "1", publication: "nigeria_bpp", buyerName: "Federal Ministry of Mines and Steel Development",
  title: "Construction of mining clinic, Anka", description: "Lot 1", supplierNames: ["Acme Construction Ltd"], amount: 4_500_000_000,
  currency: "NGN", awardDate: new Date("2024-04-02T00:00:00Z"), awardStatus: "active", procurementMethod: "Open Competitive Bidding",
  contractAmount: 4_600_000_000, contractCurrency: "NGN", releaseDate: null,
};

function jsonResponse(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });
}

describe("CAC registration numbers", () => {
  it("reads RC, BN and bare numbers and rejects names", () => {
    expect(parseCacRegistrationNumber("RC 1234567")).toEqual({ number: "1234567", companyType: "COMPANY" });
    expect(parseCacRegistrationNumber("bn-3456789")).toEqual({ number: "3456789", companyType: "BUSINESS_NAME" });
    expect(parseCacRegistrationNumber("IT 12345")).toEqual({ number: "12345", companyType: "INCORPORATED_TRUSTEES" });
    expect(parseCacRegistrationNumber("1261103")).toEqual({ number: "1261103", companyType: "COMPANY" });
    expect(parseCacRegistrationNumber("Acme Construction Ltd")).toBeNull();
  });
});

describe("public record search", () => {
  it("reports each collection separately, so one failure hides nothing else", async () => {
    const repository = new InMemoryJournolRepository();
    const fetch = vi.fn(async () => { throw new Error("network down"); });
    const outcome = await searchPublicRecords(repository, { query: "Acme", recordTypes: ["procurement", "audit_reports", "company_registry"] }, { fetch: fetch as unknown as typeof globalThis.fetch, env: { TAVILY_API_KEY: "key" } });
    const statuses = Object.fromEntries(outcome.outcomes.map((entry) => [entry.recordType, entry.status]));
    expect(statuses).toEqual({ procurement: "not_configured", company_registry: "needs_registration_number", audit_reports: "unavailable" });
    expect(outcome.outcomes.every((entry) => entry.manualLookupUrl.startsWith("https://"))).toBe(true);
  });

  it("keeps only results on the collection's official domains", async () => {
    const repository = new InMemoryJournolRepository();
    const fetch = vi.fn(async (_url: unknown, init?: RequestInit) => {
      const body = JSON.parse(String(init?.body));
      expect(body.include_domains).toEqual(["oaugf.ng"]);
      return jsonResponse({ results: [
        { url: "https://oaugf.ng/images/downloads/report-2022.pdf?utm_source=x", title: "Auditor-General annual report 2022", content: "Acme Construction Ltd was paid without a contract." },
        { url: "https://evil-oaugf.ng.example.com/fake", title: "Lookalike", content: "x" },
        { url: "https://www.premiumtimesng.com/story", title: "News story", content: "x" },
      ] });
    });
    const outcome = await searchPublicRecords(repository, { query: "Acme Construction", recordTypes: ["audit_reports"] }, { fetch: fetch as unknown as typeof globalThis.fetch, env: { TAVILY_API_KEY: "key" } });
    expect(outcome.results).toHaveLength(1);
    expect(outcome.results[0].url).toBe("https://oaugf.ng/images/downloads/report-2022.pdf");
    expect(outcome.results[0].details[0].value).toMatch(/PDF/);
    expect(outcome.outcomes[0].status).toBe("ok");
  });

  it("says when official-site search is not configured", async () => {
    const outcome = await searchPublicRecords(new InMemoryJournolRepository(), { query: "Acme", recordTypes: ["court_judgments"] }, { fetch: vi.fn() as unknown as typeof globalThis.fetch, env: {} });
    expect(outcome.outcomes[0]).toMatchObject({ recordType: "court_judgments", status: "not_configured" });
  });

  it("looks up a CAC number and discards affiliates' personal contact details", async () => {
    const fetch = vi.fn(async (url: URL | string, init?: RequestInit) => {
      const requested = new URL(String(url));
      expect(requested.pathname).toBe("/api/v1/kyc/cac/advance");
      expect(requested.searchParams.get("rc_number")).toBe("1261103");
      expect(requested.searchParams.get("company_type")).toBe("COMPANY");
      expect((init?.headers as Record<string, string>).AppId).toBe("app");
      return jsonResponse({ entity: {
        company_name: "ACME CONSTRUCTION LIMITED", rc_number: "1261103", type_of_company: "COMPANY", status: "ACTIVE", date_of_registration: "2015-06-01T00:00:00Z",
        address: "1 Example Road, Abuja", affiliates: [{ first_name: "Ada", last_name: "Okafor", affiliate_type: "DIRECTOR", phone_number: "08012345678", gender: "Female" }],
      } });
    });
    const outcome = await searchPublicRecords(new InMemoryJournolRepository(), { query: "RC 1261103", recordTypes: ["company_registry"] }, { fetch: fetch as unknown as typeof globalThis.fetch, env: { DOJAH_APP_ID: "app", DOJAH_SECRET_KEY: "secret" } });
    const result = outcome.results[0];
    expect(result.title).toBe("ACME CONSTRUCTION LIMITED");
    expect(result.details).toContainEqual({ label: "Directors, proprietors and shareholders", value: "Ada Okafor (director)" });
    expect(JSON.stringify(result)).not.toContain("08012345678");
    expect(JSON.stringify(result)).not.toContain("Female");
  });

  it("searches the procurement index once data has been imported", async () => {
    const repository = new InMemoryJournolRepository();
    repository.procurementAwards.push(award);
    vi.spyOn(repository, "getLatestProcurementIngestion").mockResolvedValue({ finishedAt: new Date("2026-10-23T03:30:00Z"), awardsUpserted: 17_000, sourceFile: "full.jsonl.gz" });
    const outcome = await searchPublicRecords(repository, { query: "acme", recordTypes: ["procurement"] }, { fetch: vi.fn() as unknown as typeof globalThis.fetch, env: {} });
    expect(outcome.outcomes[0]).toMatchObject({ status: "ok", dataAsOf: "2026-10-23" });
    expect(outcome.results[0].title).toBe("Construction of mining clinic, Anka");
  });

  it("formats an award's money and dates for reading", () => {
    const result = procurementResult(award, 0);
    expect(result.details).toContainEqual({ label: "Award value", value: "₦4,500,000,000" });
    expect(result.details).toContainEqual({ label: "Contract value", value: "₦4,600,000,000" });
    expect(result.details).toContainEqual({ label: "Award date", value: "2024-04-02" });
    expect(result.caveats.join(" ")).toMatch(/not a payment/);
  });
});
