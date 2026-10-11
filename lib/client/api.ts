export type ApiObject = Record<string, unknown>;

function isObject(value: unknown): value is ApiObject {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

/**
 * Parses API responses defensively so an HTML/empty framework error is shown
 * as an actionable endpoint/status error instead of a JSON parser exception.
 */
export async function readApiResponse(response: Response, endpoint: string): Promise<ApiObject> {
  const responseText = await response.text();
  let payload: unknown = null;

  if (responseText.trim()) {
    try {
      payload = JSON.parse(responseText);
    } catch {
      throw new Error(`${endpoint} returned a non-JSON response (HTTP ${response.status}).`);
    }
  }

  if (!isObject(payload)) {
    throw new Error(`${endpoint} returned an empty or invalid response (HTTP ${response.status}).`);
  }

  if (!response.ok) {
    const message = typeof payload.error === "string" ? payload.error : "Request failed.";
    throw new Error(`${endpoint}: ${message} (HTTP ${response.status}).`);
  }

  return payload;
}
