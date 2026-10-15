export type JournalistMessage = {
  title: string;
  detail: string;
  kind: "error" | "warning" | "info";
};

function temporaryMessageForEndpoint(endpoint?: string): JournalistMessage {
  if (endpoint === "Story discovery") {
    return { title: "News updates temporarily unavailable", detail: "Journol couldn’t refresh the latest stories right now. Please try again shortly.", kind: "error" };
  }
  if (["Saving story", "Removing saved story", "Saved stories", "Saving investigation", "Removing saved investigation", "Saved investigations"].includes(endpoint ?? "")) {
    return { title: "Your Library temporarily unavailable", detail: "Journol couldn’t update Your Library right now. Please try again shortly.", kind: "error" };
  }
  if (endpoint === "Lead selection") {
    return { title: "Analysis temporarily unavailable", detail: "Journol couldn’t prepare an investigative lead right now. Please try again shortly.", kind: "error" };
  }
  if (["Evidence assessment", "Investigation builder"].includes(endpoint ?? "")) {
    return { title: "Investigation plan temporarily unavailable", detail: "Journol couldn’t complete this stage of the investigation right now. Please try again shortly.", kind: "error" };
  }
  if (["Loading investigation state", "Saved investigation"].includes(endpoint ?? "")) {
    return { title: "Investigation unavailable", detail: "This investigation couldn’t be opened. It may have been removed or may no longer be accessible.", kind: "error" };
  }
  return {
    title: "Research temporarily unavailable",
    detail: "Journol couldn’t complete your research right now. Please try again shortly.",
    kind: "error",
  };
}

/**
 * Maps stable server categories to language for journalists. Technical status
 * codes remain useful to the browser for control flow, but are deliberately
 * kept out of ordinary product messages.
 */
export function journalistMessageForApiFailure(input: {
  code?: string;
  status?: number;
  endpoint?: string;
}): JournalistMessage {
  switch (input.code) {
    case "RESEARCH_LIMIT_REACHED":
      return {
        title: "Research limit reached",
        detail: "You’ve used your four Deep Research requests for the current hour. You can start another research session when your limit resets.",
        kind: "error",
      };
    case "RESEARCH_IN_PROGRESS":
      return {
        title: "Research already in progress",
        detail: "Another Deep Research session is currently running. Please wait for it to finish before starting a new one.",
        kind: "warning",
      };
    case "INSUFFICIENT_SOURCES":
      return {
        title: "Not enough information found",
        detail: "Journol couldn’t find enough reliable information to complete this research. Try refining your research question or providing more details about what you want to investigate.",
        kind: "warning",
      };
    case "SOURCE_ARTICLE_UNAVAILABLE":
      return {
        title: "Original article unavailable",
        detail: "Journol couldn’t access the original article needed for this research. Please reopen the story or provide a working article link.",
        kind: "error",
      };
    case "INVESTIGATION_UNAVAILABLE":
      return {
        title: "Investigation unavailable",
        detail: "This investigation couldn’t be opened. It may have been removed or may no longer be accessible.",
        kind: "error",
      };
    case "UNAUTHORIZED":
      return { title: "Sign in required", detail: "Please sign in to continue.", kind: "info" };
    case "FORBIDDEN":
      return { title: "Access unavailable", detail: "This item is not available to your account.", kind: "error" };
    case "RESEARCH_TEMPORARILY_UNAVAILABLE":
    case "SERVICE_UNAVAILABLE":
    case "UPSTREAM_FAILURE":
    case "TIMEOUT":
      if (input.endpoint === "Article retrieval") {
        return {
          title: "Original article unavailable",
          detail: "Journol couldn’t access the original article needed for this research. Please reopen the story or provide a working article link.",
          kind: "error",
        };
      }
      return temporaryMessageForEndpoint(input.endpoint);
    default:
      if (["Evidence assessment", "Investigation builder"].includes(input.endpoint ?? "")) {
        return {
          title: "Investigation plan could not be completed",
          detail: "Something prevented Journol from completing this stage of the investigation. Please try again. If the issue continues, contact support.",
          kind: "error",
        };
      }
      if (input.endpoint === "Lead selection") {
        return {
          title: "Analysis could not be completed",
          detail: "Something prevented Journol from preparing an investigative lead. Please try again. If the issue continues, contact support.",
          kind: "error",
        };
      }
      return {
        title: "Research could not be completed",
        detail: "Something prevented Journol from completing your research. Please try again. If the issue continues, contact support.",
        kind: "error",
      };
  }
}

export function journalistMessageForUnexpectedFailure(): JournalistMessage {
  return {
    title: "Research could not be completed",
    detail: "Something prevented Journol from completing your research. Please try again. If the issue continues, contact support.",
    kind: "error",
  };
}
