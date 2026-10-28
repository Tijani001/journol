import { describe, expect, it } from "vitest";
import { parsePastedStory, splitParagraphs } from "@/lib/pasted-story";
import { STORY } from "@/test/fixtures";

const body = STORY.paragraphs.join("\n\n");

describe("pasted stories", () => {
  it("splits on blank lines, or on single lines when there are none", () => {
    expect(splitParagraphs("One.\n\nTwo\nstill two.\n\n\nThree.")).toEqual(["One.", "Two still two.", "Three."]);
    expect(splitParagraphs("One.\nTwo.\r\nThree.")).toEqual(["One.", "Two.", "Three."]);
  });

  it("uses a short first line as the headline when none is given", () => {
    const result = parsePastedStory({ text: `${STORY.title}\n\n${body}` });
    expect("story" in result && result.story.title).toBe(STORY.title);
    expect("story" in result && result.story.paragraphs).toEqual(STORY.paragraphs);
    expect("story" in result && result.story.url).toMatch(/^pasted:[0-9a-f]{32}$/);
    expect("story" in result && result.story.publisher).toBe("Pasted story");
  });

  it("keeps the real link and outlet when given, so the story can still be opened", () => {
    const result = parsePastedStory({ text: body, title: "FG to build clinics", publisher: "The Sentinel", url: "https://www.premiumtimesng.com/news/x?utm_source=wa" });
    expect("story" in result && result.story).toMatchObject({ url: "https://www.premiumtimesng.com/news/x", publisher: "The Sentinel", title: "FG to build clinics" });
  });

  it("gives the same address to the same text", () => {
    const first = parsePastedStory({ text: body, title: "A" });
    const second = parsePastedStory({ text: body, title: "B" });
    expect("story" in first && "story" in second && first.story.url === second.story.url).toBe(true);
  });

  it("refuses text that is too short or too long", () => {
    expect(parsePastedStory({ text: "Too short." })).toHaveProperty("error");
    expect(parsePastedStory({ text: "word ".repeat(9_000) })).toHaveProperty("error");
  });
});
