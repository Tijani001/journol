import { lookup as dnsLookup } from "node:dns/promises";
import { isIP } from "node:net";
import { Agent, buildConnector } from "undici";
import ipaddr from "ipaddr.js";

export type SafeArticleDestination = {
  url: URL;
  addresses: string[];
};

const DNS_TIMEOUT_MS = 4_000;

function normalizeHostname(hostname: string): string {
  return hostname
    .toLowerCase()
    .replace(/^\[|\]$/g, "")
    .replace(/\.$/, "");
}

function isPublicAddress(address: string): boolean {
  try {
    return ipaddr.process(address).range() === "unicast";
  } catch {
    return false;
  }
}

function withTimeout<T>(
  operation: Promise<T>,
  timeoutMs: number,
): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const timer = setTimeout(() => {
      reject(new Error("DNS_TIMEOUT"));
    }, timeoutMs);

    operation.then(
      (value) => {
        clearTimeout(timer);
        resolve(value);
      },
      (error) => {
        clearTimeout(timer);
        reject(error);
      },
    );
  });
}

export async function validateArticleUrl(
  input: string,
): Promise<SafeArticleDestination> {
  let url: URL;

  try {
    url = new URL(input);
  } catch {
    throw new Error("INVALID_ARTICLE_URL");
  }

  if (!["http:", "https:"].includes(url.protocol)) {
    throw new Error("INVALID_ARTICLE_PROTOCOL");
  }

  if (url.username || url.password) {
    throw new Error("ARTICLE_URL_CREDENTIALS_NOT_ALLOWED");
  }

  if (
    (url.protocol === "http:" && url.port && url.port !== "80") ||
    (url.protocol === "https:" && url.port && url.port !== "443")
  ) {
    throw new Error("ARTICLE_URL_PORT_NOT_ALLOWED");
  }

  const hostname = normalizeHostname(url.hostname);

  if (
    !hostname ||
    hostname === "localhost" ||
    hostname.endsWith(".localhost") ||
    hostname.endsWith(".local") ||
    hostname.endsWith(".internal")
  ) {
    throw new Error("ARTICLE_HOST_NOT_ALLOWED");
  }

  let addresses: string[];

  if (isIP(hostname)) {
    addresses = [hostname];
  } else {
    let results: Array<{ address: string; family: number }>;

    try {
      results = await withTimeout(
        dnsLookup(hostname, {
          all: true,
          verbatim: true,
        }),
        DNS_TIMEOUT_MS,
      );
    } catch (error) {
      if (error instanceof Error && error.message === "DNS_TIMEOUT") {
        throw error;
      }

      throw new Error("ARTICLE_HOST_RESOLUTION_FAILED");
    }

    addresses = results.map((result) => result.address);
  }

  if (
    addresses.length === 0 ||
    addresses.some((address) => !isPublicAddress(address))
  ) {
    throw new Error("ARTICLE_ADDRESS_NOT_ALLOWED");
  }

  return { url, addresses };
}

export function createPinnedDispatcher(
  destination: SafeArticleDestination,
): Agent {
  const expectedHostname = normalizeHostname(
    destination.url.hostname,
  );

  const pinnedAddresses = destination.addresses;
  const connector = buildConnector({});

  return new Agent({
    connections: 1,
    pipelining: 0,

    connect: (options, callback) => {
      const requestedHostname = normalizeHostname(options.hostname);

      if (requestedHostname !== expectedHostname) {
        callback(
          new Error("ARTICLE_CONNECTION_HOST_MISMATCH"),
          null,
        );
        return;
      }

      const address = pinnedAddresses[0];

      if (!address || !isPublicAddress(address)) {
        callback(
          new Error("ARTICLE_CONNECTION_ADDRESS_NOT_ALLOWED"),
          null,
        );
        return;
      }

      const isLiteralAddress = isIP(expectedHostname) !== 0;

      connector(
        {
          ...options,
          hostname: address,
          host: address,
          ...(isLiteralAddress
            ? {}
            : { servername: expectedHostname }),
        },
        callback,
      );
    },
  });
}