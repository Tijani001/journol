import type { Metadata } from "next";
import Link from "next/link";
import { ContactLine } from "@/app/components/contact-line";
import { OPERATOR_NAME } from "@/lib/site";

export const metadata: Metadata = { title: "Terms of use" };

export default function TermsPage() {
  return (
    <main className="page legal">
      <h1>Terms of use</h1>
      <p className="muted">Last updated 28 October 2026</p>

      <p>
        These terms are an agreement between you and {OPERATOR_NAME} (&ldquo;we&rdquo;), which runs Journol. By creating an account or using Journol, you agree to them.
      </p>

      <h2>What Journol does</h2>
      <p>
        Journol reads published news stories you choose, searches the web for related coverage, and suggests open questions and follow-up angles.
        It uses artificial intelligence to do this.
      </p>

      <h2>Journol gives you leads, not facts</h2>
      <p>
        Journol&apos;s suggestions are starting points for your own reporting. They can be incomplete or wrong, even with the checks Journol runs.
        A related report may itself be inaccurate, and &ldquo;Not yet reported&rdquo; only means Journol&apos;s search didn&apos;t find anyone asking the question.
        Verify everything independently before you publish or act on it. You are responsible for what you publish.
      </p>

      <h2>Your account</h2>
      <p>You need an account to use Journol. Keep your sign-in details safe, and tell us if you think someone else has used your account. You must be at least 18.</p>

      <h2>Acceptable use</h2>
      <p>You agree not to use Journol to:</p>
      <ul>
        <li>harass, threaten, or expose the private information of any person;</li>
        <li>plan or support anything illegal, or invade anyone&apos;s privacy without a genuine public-interest reason;</li>
        <li>produce or spread content you know to be false;</li>
        <li>overload, probe, scrape, or get around the limits of the service, or resell it without our written permission.</li>
      </ul>
      <p>We may suspend or close accounts that break these rules.</p>

      <h2>Stories and other people&apos;s content</h2>
      <p>
        Stories belong to their publishers. Journol shows short quotations and links to the original, and doesn&apos;t republish stories.
        Only submit text you&apos;re entitled to use for your work. What Journol produces for you (summaries, questions, angles) is yours to use in your reporting.
      </p>

      <h2>Limits and availability</h2>
      <p>
        Journol is free during this early period, with a daily limit on the number of stories each person can run. We may change features,
        limits or pricing; if paid plans are introduced, we&apos;ll tell you before anything is charged. We aim to keep Journol running but
        can&apos;t promise it will always be available or free of errors.
      </p>

      <h2>Ending your use</h2>
      <p>You can stop using Journol and delete your account at any time on your <Link href="/account">account page</Link>.</p>

      <h2>Liability</h2>
      <p>
        Journol is provided &ldquo;as is&rdquo;. To the extent the law allows, we aren&apos;t liable for indirect or consequential loss, or for
        decisions you make or content you publish based on Journol&apos;s suggestions. Nothing in these terms limits liability that can&apos;t be limited by law.
      </p>

      <h2>Law</h2>
      <p>These terms are governed by the laws of the Federal Republic of Nigeria.</p>

      <h2>Contact</h2>
      <p>Questions about these terms: <ContactLine />.</p>
    </main>
  );
}
