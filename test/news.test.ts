import { expect, it, vi } from "vitest";

const parseURL = vi.fn();
vi.mock("rss-parser", () => ({ default: class Parser { parseURL = parseURL; } }));

it("reports partial RSS-feed failures without discarding successful feeds", async () => {
  parseURL
    .mockResolvedValueOnce({ items: [{ guid: "a", title: "First", link: "https://example.test/a", isoDate: "2026-01-01" }] })
    .mockRejectedValueOnce(new Error("unavailable"))
    .mockResolvedValueOnce({ items: [] })
    .mockResolvedValueOnce({ items: [] })
    .mockResolvedValueOnce({ items: [] });
  const { GET } = await import("@/app/api/news/route");
  const response = await GET(new Request("http://test/api/news"));
  const body = await response.json();
  expect(response.status).toBe(200);
  expect(body.count).toBe(1);
  expect(body.sourcesAvailable).toBe(4);
  expect(body.unavailableSources).toEqual(["The Guardian Nigeria"]);
});

it("returns a safe upstream failure when every RSS feed fails", async () => {
  parseURL.mockRejectedValue(new Error("unavailable"));
  const { GET } = await import("@/app/api/news/route");
  const response = await GET(new Request("http://test/api/news"));
  expect(response.status).toBe(502);
  expect((await response.json()).code).toBe("UPSTREAM_FAILURE");
});
