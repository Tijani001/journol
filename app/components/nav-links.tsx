"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Show, UserButton } from "@clerk/nextjs";

const APP_LINKS = [
  { href: "/", label: "Discover", match: (path: string) => path === "/" || path.startsWith("/read") },
  { href: "/stories", label: "My stories", match: (path: string) => path.startsWith("/stories") || path.startsWith("/story/") },
  { href: "/angles", label: "My angles", match: (path: string) => path.startsWith("/angles") || path.startsWith("/angle/") },
];

export function NavLinks({ clerk }: { clerk: boolean }) {
  const pathname = usePathname();
  if (pathname.startsWith("/sign-in") || pathname.startsWith("/sign-up")) return null;

  const appLinks = APP_LINKS.map((link) => (
    <Link key={link.href} href={link.href} className="nav-link" aria-current={link.match(pathname) ? "page" : undefined}>
      {link.label}
    </Link>
  ));

  // Without Clerk (local development) the app links always show.
  if (!clerk) return <nav aria-label="Main" className="site-nav">{appLinks}</nav>;

  return (
    <nav aria-label="Main" className="site-nav">
      <Show when="signed-in">
        {appLinks}
        <span className="nav-user"><UserButton /></span>
      </Show>
      <Show when="signed-out">
        <Link href="/sign-in" className="nav-link">Sign in</Link>
        <Link href="/sign-up" className="button button-primary nav-cta">Get started</Link>
      </Show>
    </nav>
  );
}
