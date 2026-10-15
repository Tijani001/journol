import { journalistMessageForApiFailure, type JournalistMessage } from "@/lib/client/journalist-messages";

export type ApiObject = Record<string, unknown>;

export class JournolApiError extends Error {
  readonly code: string;
  readonly status: number;
  readonly journalistMessage: JournalistMessage;

  constructor(input: { code?: string; status: number; endpoint: string }) {
    const journalistMessage = journalistMessageForApiFailure({
      code: input.code,
      status: input.status,
      endpoint: input.endpoint,
    });
    super(journalistMessage.detail);
    this.name = "JournolApiError";
    this.code = input.code || "UNEXPECTED_FAILURE";
    this.status = input.status;
    this.journalistMessage = journalistMessage;
  }
}

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
      throw new JournolApiError({ status: response.status, endpoint });
    }
  }

  if (!isObject(payload)) {
    throw new JournolApiError({ status: response.status, endpoint });
  }

  if (!response.ok) {
    const code = typeof payload.code === "string" ? payload.code : "";
    throw new JournolApiError({ code, status: response.status, endpoint });
  }

  return payload;
}
