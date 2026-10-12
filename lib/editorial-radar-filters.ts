/** Pure filter-menu state helpers shared by the client UI and regression tests. */
export type FilterPopoverEvent = "toggle" | "outside-pointer" | "escape";

export function nextFilterPopoverState(
  isOpen: boolean,
  event: FilterPopoverEvent,
) {
  if (event === "toggle") return !isOpen;
  return false;
}

export function toggleFilterSelection(values: string[], value: string) {
  return values.includes(value)
    ? values.filter((item) => item !== value)
    : [...values, value];
}

export function countActiveFilters(...groups: string[][]) {
  return groups.reduce((total, group) => total + group.length, 0);
}
