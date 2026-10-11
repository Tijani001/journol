import { describe, expect, it } from "vitest";
import { normalizeStoryUrl } from "@/lib/story-url";
import { InMemoryJournolRepository } from "@/lib/server/repository";

describe("saved stories", () => {
  it("normalizes only tracking parameters for stable feed identities", () => {
    expect(normalizeStoryUrl("https://Example.test/story/?utm_source=rss&fbclid=abc#section"))
      .toBe("https://example.test/story");
    expect(normalizeStoryUrl("https://example.test/story?edition=west"))
      .toBe("https://example.test/story?edition=west");
    expect(() => normalizeStoryUrl("javascript:alert(1)")).toThrow("INVALID_STORY_URL");
  });

  it("creates one account-scoped bookmark and preserves it across list refreshes", async () => {
    const repository = new InMemoryJournolRepository();
    const owner = await repository.createUser({ authIssuer: "test", authSubject: "owner", email: null });
    const other = await repository.createUser({ authIssuer: "test", authSubject: "other", email: null });
    const input = { userId: owner.id, canonicalUrl: "https://example.test/story", originalUrl: "https://example.test/story", title: "Story", publisher: "Example", publishedAt: null, description: "Preview" };
    const first = await repository.saveStoryForUser(input);
    const repeated = await repository.saveStoryForUser(input);
    expect(repeated.id).toBe(first.id);
    await expect(repository.listSavedStoriesForUser(owner.id)).resolves.toHaveLength(1);
    await expect(repository.listSavedStoriesForUser(other.id)).resolves.toEqual([]);
    expect(await repository.unsaveStoryForUser(other.id, first.id)).toBe(false);
    expect(await repository.listSavedStoriesForUser(owner.id)).toHaveLength(1);
    expect(await repository.unsaveStoryForUser(owner.id, first.id)).toBe(true);
    await expect(repository.listSavedStoriesForUser(owner.id)).resolves.toEqual([]);
  });
});
