import { afterEach, describe, expect, it, vi } from "vitest";
import { connectionHash, guestCookieHeader, mintGuestToken, readCookie, verifyGuestToken } from "@/lib/server/guest";
import { humanCheckEnabled, verifyHuman } from "@/lib/server/human-check";

describe("guest cookie", () => {
  it("only accepts IDs this server signed", () => {
    const minted = mintGuestToken()!;
    expect(verifyGuestToken(minted.token)).toBe(minted.id);
    const [id, signature] = minted.token.split(".");
    expect(verifyGuestToken(`${id}x.${signature}`)).toBeNull();
    expect(verifyGuestToken(`${id}.${signature.slice(0, -2)}AA`)).toBeNull();
    expect(verifyGuestToken(`${id}`)).toBeNull();
    expect(verifyGuestToken("a.b.c")).toBeNull();
    expect(verifyGuestToken(undefined)).toBeNull();
  });

  it("is httpOnly, lasts 30 days, and can be read back from a Cookie header", () => {
    const { token } = mintGuestToken()!;
    const header = guestCookieHeader(token);
    expect(header).toContain("HttpOnly");
    expect(header).toContain("SameSite=Lax");
    expect(header).toContain(`Max-Age=${30 * 24 * 3600}`);
    expect(readCookie(`theme=dark; journol_guest=${token}; x=1`, "journol_guest")).toBe(token);
  });

  it("hashes the connection address one way, preferring Cloudflare's header", () => {
    const request = (headers: Record<string, string>) => new Request("http://localhost/", { headers });
    const a = connectionHash(request({ "cf-connecting-ip": "102.89.1.1", "x-forwarded-for": "1.2.3.4" }));
    const b = connectionHash(request({ "cf-connecting-ip": "102.89.1.1" }));
    expect(a).toBe(b);
    expect(a).not.toContain("102.89");
    expect(connectionHash(request({ "x-forwarded-for": "5.6.7.8, 9.9.9.9" }))).not.toBe(a);
    expect(connectionHash(request({}))).toBeNull();
  });
});

describe("human check", () => {
  afterEach(() => {
    delete process.env.TURNSTILE_SECRET_KEY;
    delete process.env.NEXT_PUBLIC_TURNSTILE_SITE_KEY;
  });

  it("is skipped until both keys are set", async () => {
    expect(humanCheckEnabled()).toBe(false);
    await expect(verifyHuman(null)).resolves.toBe(true);
  });

  it("asks Cloudflare and trusts only its answer", async () => {
    process.env.TURNSTILE_SECRET_KEY = "secret";
    process.env.NEXT_PUBLIC_TURNSTILE_SITE_KEY = "site";
    const fetchImpl = vi.fn(async (_url: string, init: RequestInit) => Response.json({ success: String(init.body).includes("response=good") }));
    await expect(verifyHuman("good", { fetchImpl })).resolves.toBe(true);
    await expect(verifyHuman("bad", { fetchImpl })).resolves.toBe(false);
    await expect(verifyHuman(null, { fetchImpl })).resolves.toBe(false);
    await expect(verifyHuman("good", { fetchImpl: async () => { throw new Error("down"); } })).resolves.toBe(false);
  });
});
