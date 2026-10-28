import { CONTACT_EMAIL } from "@/lib/site";

/** How to reach a person, from NEXT_PUBLIC_CONTACT_EMAIL. */
export function ContactLine() {
  return CONTACT_EMAIL ? <a href={`mailto:${CONTACT_EMAIL}`}>{CONTACT_EMAIL}</a> : <>the contact address shown in the site footer</>;
}
