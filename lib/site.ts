/** Public details about the service, set per deployment. */
export const SITE_URL = (process.env.NEXT_PUBLIC_SITE_URL || "https://journol.onrender.com").replace(/\/$/, "");
/** The public address without https://, for instructions people read. */
export const SITE_HOST = SITE_URL.replace(/^https?:\/\//, "");
/** The person or company that runs Journol, as named in the Terms and Privacy policy. */
export const OPERATOR_NAME = process.env.NEXT_PUBLIC_OPERATOR_NAME || "Journol";
/** Where journalists can reach a human, for support and privacy requests. */
export const CONTACT_EMAIL = process.env.NEXT_PUBLIC_CONTACT_EMAIL || "";
