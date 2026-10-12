import { describe, expect, it } from "vitest";
import { countActiveFilters, nextFilterPopoverState, toggleFilterSelection } from "@/lib/editorial-radar-filters";

describe("Editorial Radar filter controls", () => {
  it("starts closed and supports toggle, outside-click, and Escape close behavior", () => {
    const initiallyOpen = false;
    const opened = nextFilterPopoverState(initiallyOpen, "toggle");
    expect(opened).toBe(true);
    expect(nextFilterPopoverState(opened, "outside-pointer")).toBe(false);
    expect(nextFilterPopoverState(opened, "escape")).toBe(false);
  });

  it("adds and removes individual accessible filter selections", () => {
    const selected = toggleFilterSelection([], "Governance");
    expect(selected).toEqual(["Governance"]);
    expect(toggleFilterSelection(selected, "Governance")).toEqual([]);
  });

  it("counts selections across topics, continents, and countries", () => {
    expect(countActiveFilters(["Politics"], ["Africa"], ["Nigeria", "Kenya"])).toBe(4);
    expect(countActiveFilters([], [], [])).toBe(0);
  });
});
