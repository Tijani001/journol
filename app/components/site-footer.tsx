import Link from "next/link";
import { CONTACT_EMAIL } from "@/lib/site";

export function SiteFooter() {
  return (
    <footer className="site-footer">
      <div className="site-footer-inner">
        <p className="footer-note">
          Journol suggests leads to check, not facts. Verify everything with your own reporting before you publish.
        </p>
        <nav aria-label="Footer" className="footer-links">
          <Link href="/terms">Terms</Link>
          <Link href="/privacy">Privacy</Link>
          <Link href="/account">Your account</Link>
          {CONTACT_EMAIL ? <a href={`mailto:${CONTACT_EMAIL}`}>Contact</a> : null}
        </nav>
      </div>
    </footer>
  );
}
