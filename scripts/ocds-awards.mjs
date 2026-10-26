// Flattens one line of OCDS data into contract-award rows. A line may be a
// compiled release, a record (with compiledRelease or releases) or a release
// package, depending on how the publisher's file was produced.

const MAX_TEXT = 2_000;

function text(value, maxLength = MAX_TEXT) {
  return typeof value === "string" && value.trim() ? value.replace(/\s+/g, " ").trim().slice(0, maxLength) : null;
}

function amount(value) {
  if (!value || typeof value !== "object") return { amount: null, currency: null };
  const parsed = typeof value.amount === "number" ? value.amount : typeof value.amount === "string" ? Number(value.amount.replace(/,/g, "")) : NaN;
  return { amount: Number.isFinite(parsed) ? parsed : null, currency: text(value.currency, 10) };
}

function timestamp(value) {
  if (typeof value !== "string" || !value.trim()) return null;
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? null : parsed.toISOString();
}

function releasesIn(document) {
  if (!document || typeof document !== "object") return [];
  if (document.compiledRelease && typeof document.compiledRelease === "object") return [document.compiledRelease];
  if (Array.isArray(document.records)) return document.records.flatMap(releasesIn);
  if (Array.isArray(document.releases)) {
    // In a record, releases may be linked stubs; keep only embedded releases.
    return document.releases.filter((release) => release && typeof release === "object" && typeof release.ocid === "string");
  }
  return typeof document.ocid === "string" ? [document] : [];
}

function partyName(release, id, roles) {
  const parties = Array.isArray(release.parties) ? release.parties : [];
  const byId = id ? parties.find((party) => party && party.id === id) : null;
  if (byId) return text(byId.name, 500);
  const byRole = parties.find((party) => party && Array.isArray(party.roles) && party.roles.some((role) => roles.includes(role)));
  return byRole ? text(byRole.name, 500) : null;
}

export function awardsFromRelease(release) {
  const ocid = text(release.ocid, 200);
  const awards = Array.isArray(release.awards) ? release.awards : [];
  if (!ocid || !awards.length) return [];
  const tender = release.tender && typeof release.tender === "object" ? release.tender : {};
  const contracts = Array.isArray(release.contracts) ? release.contracts : [];
  const buyerName = text(release.buyer?.name, 500)
    ?? text(tender.procuringEntity?.name, 500)
    ?? partyName(release, release.buyer?.id, ["buyer", "procuringEntity"]);
  const procurementMethod = text(tender.procurementMethodDetails, 200) ?? text(tender.procurementMethod, 200);

  return awards.filter((award) => award && typeof award === "object").map((award, index) => {
    const supplierNames = [...new Set((Array.isArray(award.suppliers) ? award.suppliers : [])
      .map((supplier) => text(supplier?.name, 500) ?? partyName(release, supplier?.id, []))
      .filter(Boolean))];
    const value = amount(award.value);
    const contract = contracts.find((item) => item && award.id !== undefined && String(item.awardID) === String(award.id));
    const contractValue = amount(contract?.value);
    const title = text(award.title, 1_000) ?? text(contract?.title, 1_000) ?? text(tender.title, 1_000);
    const description = text(award.description) ?? text(contract?.description) ?? text(tender.description);
    const searchText = [title, buyerName, ...supplierNames, description?.slice(0, 500)].filter(Boolean).join(" | ").toLowerCase();
    return {
      ocid,
      awardId: text(award.id === undefined || award.id === null ? null : String(award.id), 200) ?? `award-${index + 1}`,
      buyerName,
      title,
      description,
      supplierNames,
      amount: value.amount,
      currency: value.currency,
      awardDate: timestamp(award.date),
      awardStatus: text(award.status, 100),
      procurementMethod,
      contractAmount: contractValue.amount,
      contractCurrency: contractValue.currency,
      releaseDate: timestamp(release.date),
      searchText: searchText || ocid.toLowerCase(),
    };
  });
}

export function awardsFromOcdsLine(line) {
  return releasesIn(JSON.parse(line)).flatMap(awardsFromRelease);
}
