"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Show, UserButton } from "@clerk/nextjs";

export function NavLinks({ showUserButton }: { showUserButton: boolean }) {
  const pathname = usePathname();
  if (pathname.startsWith("/sign-in") || pathname.startsWith("/sign-up")) return null;
  const onAngles = pathname.startsWith("/angles");
  return (
    <nav aria-label="Main" className="site-nav">
      <Link href="/" className="nav-link" aria-current={!onAngles && pathname === "/" ? "page" : undefined}>Discover</Link>
      <Link href="/angles" className="nav-link" aria-current={onAngles ? "page" : undefined}>My angles</Link>
      {showUserButton ? (
        <span className="nav-user">
          <Show when="signed-in"><UserButton /></Show>
        </span>
      ) : null}
    </nav>
  );
}
