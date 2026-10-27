import type { Metadata } from "next";
import type { ReactNode } from "react";
import { ClerkProvider } from "@clerk/nextjs";
import { SiteHeader } from "@/app/components/site-header";
import { isClerkConfigured } from "@/lib/server/clerk-config";
import "./globals.css";

export const metadata: Metadata = {
  title: { default: "Journol", template: "%s · Journol" },
  description: "Find new angles and leads in stories that are already published.",
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
        <SiteHeader showUserButton={clerk} />
        {children}
      </body>
    </html>
  );
  return clerk ? <ClerkProvider>{page}</ClerkProvider> : page;
}
