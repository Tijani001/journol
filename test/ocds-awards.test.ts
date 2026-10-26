import { describe, expect, it } from "vitest";
// The import script is plain Node ESM so it runs without a build step.
import { awardsFromOcdsLine } from "../scripts/ocds-awards.mjs";

const release = {
  ocid: "ocds-nigeria-001",
  date: "2024-03-01T00:00:00Z",
  buyer: { id: "MDA-1", name: "Federal Ministry of Mines and Steel Development" },
  parties: [{ id: "SUP-9", name: "Acme Construction Ltd", roles: ["supplier"] }],
  tender: { title: "Construction of mining clinic, Anka", procurementMethod: "open", procurementMethodDetails: "Open Competitive Bidding" },
  awards: [
    { id: 1, title: "Mining clinic award", date: "2024-04-02", status: "active", value: { amount: "4,500,000,000", currency: "NGN" }, suppliers: [{ id: "SUP-9" }] },
    { suppliers: [{ name: "Beta Ventures" }], value: { amount: 12.5, currency: "NGN" } },
  ],
  contracts: [{ awardID: "1", value: { amount: 4_600_000_000, currency: "NGN" } }],
};

describe("OCDS award flattening", () => {
  it("produces one row per award with supplier names resolved from parties", () => {
    const rows = awardsFromOcdsLine(JSON.stringify(release));
    expect(rows).toHaveLength(2);
    expect(rows[0]).toMatchObject({
      ocid: "ocds-nigeria-001", awardId: "1", buyerName: "Federal Ministry of Mines and Steel Development",
      supplierNames: ["Acme Construction Ltd"], amount: 4_500_000_000, currency: "NGN", contractAmount: 4_600_000_000,
      procurementMethod: "Open Competitive Bidding", awardDate: "2024-04-02T00:00:00.000Z",
    });
    expect(rows[0].searchText).toContain("acme construction ltd");
    expect(rows[1]).toMatchObject({ awardId: "award-2", supplierNames: ["Beta Ventures"], title: "Construction of mining clinic, Anka" });
  });

  it("reads records, record packages and release packages", () => {
    expect(awardsFromOcdsLine(JSON.stringify({ ocid: "x", compiledRelease: { ...release, ocid: "ocds-2" }, releases: [{ url: "u", date: "d", tag: ["award"] }] }))[0].ocid).toBe("ocds-2");
    expect(awardsFromOcdsLine(JSON.stringify({ records: [{ compiledRelease: release }] }))).toHaveLength(2);
    expect(awardsFromOcdsLine(JSON.stringify({ releases: [release, { ocid: "no-awards" }] }))).toHaveLength(2);
  });

  it("skips processes without awards and throws on malformed lines", () => {
    expect(awardsFromOcdsLine('{"ocid":"tender-only","tender":{}}')).toEqual([]);
    expect(() => awardsFromOcdsLine("{not json")).toThrow();
  });
});
