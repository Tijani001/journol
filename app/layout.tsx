import type { Metadata } from "next";
import type { ReactNode } from "react";
import { ClerkProvider } from "@clerk/nextjs";
import { SiteFooter } from "@/app/components/site-footer";
import { SiteHeader } from "@/app/components/site-header";
import { SITE_URL } from "@/lib/site";
import { isClerkConfigured } from "@/lib/server/clerk-config";
import "./globals.css";

const DESCRIPTION = "Paste a published story. Journol shows what it leaves open, checks what other outlets have reported, and suggests new angles to chase.";

export const metadata: Metadata = {
  metadataBase: new URL(SITE_URL),
  title: { default: "Journol: find the question worth chasing", template: "%s · Journol" },
  description: DESCRIPTION,
  openGraph: { type: "website", siteName: "Journol", title: "Journol: find the question worth chasing", description: DESCRIPTION },
  twitter: { card: "summary_large_image", title: "Journol: find the question worth chasing", description: DESCRIPTION },
};

export default function RootLayout({ children }: Readonly<{ children: ReactNode }>) {
  const clerk = isClerkConfigured();
  const page = (
    <html lang="en">
      <head>
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="anonymous" />
        {/* eslint-disable-next-line @next/next/no-page-custom-font -- App Router root layout applies to every page. */}
        <link href="https://fonts.googleapis.com/css2?family=DM+Sans:ital,wght@0,400;0,500;0,600;0,700;1,400&family=Manrope:wght@600;700;800&display=swap" rel="stylesheet" />
      </head>
      <body>
        <SiteHeader clerk={clerk} />
        {children}
        <SiteFooter />
      </body>
    </html>
  );
  return clerk ? <ClerkProvider>{page}</ClerkProvider> : page;
}
