import type { Metadata } from "next";
import type { ReactNode } from "react";
import { AuthProvider } from "@/app/auth-provider";
import "./globals.css";

export const metadata: Metadata = {
  title: "Journol",
  description: "Evidence-led newsroom intelligence for investigative reporting.",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: ReactNode;
}>) {
  return (
    <html lang="en">
      <body>
        <AuthProvider>
          {children}
        </AuthProvider>
      </body>
    </html>
  );
}
