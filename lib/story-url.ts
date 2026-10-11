const TRACKING_PARAMETER = /^(utm_[a-z0-9_]+|fbclid|gclid|dclid|mc_cid|mc_eid)$/i;

/**
 * Produces a stable bookmark identity without fetching the URL. It only strips
 * well-known tracking parameters and fragments, never conflates publishers or
 * articles based on their titles.
 */
export function normalizeStoryUrl(value: string): string {
  const url = new URL(value);
  if (url.protocol !== "http:" && url.protocol !== "https:") {
    throw new Error("INVALID_STORY_URL");
  }
  if (url.username || url.password) throw new Error("INVALID_STORY_URL");
  for (const key of [...url.searchParams.keys()]) {
    if (TRACKING_PARAMETER.test(key)) url.searchParams.delete(key);
  }
  url.hash = "";
  if (url.pathname.length > 1) url.pathname = url.pathname.replace(/\/+$/, "");
  return url.toString();
}
