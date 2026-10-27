import type { Coverage } from "@/lib/engine/types";

/** "Not yet reported" only appears when the web search ran and no related report asks the question. */
export function CoverageTag({ coverage }: { coverage: Coverage }) {
  if (coverage === "not_yet_reported") return <span className="tag tag-open">Not yet reported</span>;
  if (coverage === "partly_covered") return <span className="tag tag-partly">Partly covered</span>;
  return null;
}
