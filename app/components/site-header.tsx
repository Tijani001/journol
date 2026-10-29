import Link from "next/link";
import { NavLinks } from "@/app/components/nav-links";

export function BrandMark() {
  return (
    <span className="brand">
      <span className="brand-mark" aria-hidden="true">j.</span>
      <span className="brand-name">journol</span>
    </span>
  );
}

export function SiteHeader({ clerk, guest }: { clerk: boolean; guest: boolean }) {
  return (
    <header className="site-header">
      <div className="site-header-inner">
        <Link href="/" aria-label="Journol home" className="brand">
          <BrandMark />
        </Link>
        <NavLinks clerk={clerk} guest={guest} />
      </div>
    </header>
  );
}
