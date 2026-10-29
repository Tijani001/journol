import type { Metadata } from "next";
import Link from "next/link";
import { ContactLine } from "@/app/components/contact-line";
import { OPERATOR_NAME } from "@/lib/site";

export const metadata: Metadata = { title: "Privacy policy" };

export default function PrivacyPage() {
  return (
    <main className="page legal">
      <h1>Privacy policy</h1>
      <p className="muted">Last updated 28 October 2026</p>

      <p>
        Journol is run by {OPERATOR_NAME} (&ldquo;we&rdquo;). This policy explains what personal data Journol collects when you use it,
        why, who else handles it, and the rights you have under the Nigeria Data Protection Act 2023 (NDPA) and other laws that apply to you.
      </p>

      <h2>What we collect</h2>
      <ul>
        <li><strong>Your account.</strong> Your name, email address and sign-in details, handled by our sign-in provider. We keep only an internal ID that links your work to you.</li>
        <li><strong>What you give Journol.</strong> The links and story text you submit, and what Journol produces from them: summaries, open questions, angles, pitches and the related reports it found.</li>
        <li><strong>How you use it.</strong> The angles you save, their status and steps, your 👍/👎 ratings, and a count of how many stories you run each day (used for daily limits).</li>
        <li><strong>Technical records.</strong> When something fails, we record what kind of failure it was and the name of the website involved, not the story text. Our host keeps standard server logs.</li>
      </ul>
      <p>We don&apos;t use advertising trackers, and we don&apos;t sell your data.</p>

      <h2>Using Journol as a guest</h2>
      <p>
        You can use Journol without an account. When you do, we set one cookie on your browser holding a random guest ID, signed so that
        only Journol can create it. It links the stories you analyse to that browser and is strictly necessary for the service. We don&apos;t
        know who you are; we don&apos;t collect your name or email.
      </p>
      <p>
        To stop free stories being abused, we keep a one-way, scrambled code made from your internet connection&apos;s IP address with each
        guest story. We can&apos;t turn that code back into your IP address, and we use it only to enforce daily limits. Before a new
        guest&apos;s first story, Cloudflare Turnstile may check that you&apos;re a person; Cloudflare processes technical information about
        your browser to do this.
      </p>
      <p>
        Guest work is deleted 30 days after you first use Journol, unless you create an account. If you do, it moves into your account.
        You can delete it yourself at any time on the account page.
      </p>

      <h2>Why we use it</h2>
      <ul>
        <li><strong>To provide Journol to you</strong> (performing our agreement with you): reading stories, finding angles, and keeping your stories and angles in your account.</li>
        <li><strong>To keep it working and affordable</strong> (our legitimate interests): daily limits, preventing abuse, fixing failures, and improving angle quality. To improve quality, we may look at angle headlines, the outlet and headline of the story, and your ratings. We don&apos;t read your notes or pasted text for this.</li>
        <li><strong>To meet legal obligations</strong>, where the law requires.</li>
      </ul>

      <h2>Who else handles your data</h2>
      <p>Journol relies on these service providers, who process data on our instructions:</p>
      <ul>
        <li><strong>Clerk</strong> (sign-in and accounts), United States.</li>
        <li><strong>OpenAI</strong> (reads the story and writes the summary, questions and angles), United States. Under OpenAI&apos;s API terms, data sent through its API is not used to train its models by default.</li>
        <li><strong>Tavily</strong> (web search for related coverage), which receives search queries built from the story, such as names and topics, not your account details.</li>
        <li><strong>Render</strong> (hosting and database), with servers in Frankfurt, Germany.</li>
        <li><strong>Cloudflare</strong> (the check that a new guest is a person, and network delivery).</li>
      </ul>
      <p>
        Because these providers are outside Nigeria, your data is transferred abroad. We rely on the transfer bases the NDPA allows,
        including the providers&apos; contractual data-protection commitments, and transfers necessary to provide the service you asked for.
      </p>

      <h2>How long we keep it</h2>
      <p>
        We keep your stories, angles and ratings until you delete your account. Daily usage counts and failure records are kept for up to 12 months.
        When you delete your account, your data is removed from Journol straight away. Copies in our providers&apos; backups are deleted on their normal schedule.
      </p>

      <h2>Your rights</h2>
      <p>Under the NDPA you can ask us to:</p>
      <ul>
        <li>tell you what personal data we hold about you and give you a copy;</li>
        <li>correct data that is wrong;</li>
        <li>delete your data (you can do this yourself on your <Link href="/account">account page</Link>);</li>
        <li>give you your data in a portable format;</li>
        <li>stop or restrict processing, or object to it.</li>
      </ul>
      <p>
        To use these rights, write to <ContactLine />. We&apos;ll answer within the time the law sets.
        You can also complain to the Nigeria Data Protection Commission (NDPC).
      </p>

      <h2>Security</h2>
      <p>
        Connections to Journol are encrypted. Each journalist can see only their own stories and angles. Access to the database and to our
        providers is limited to the people who run Journol. No system is perfectly secure; if a breach affects you, we&apos;ll tell you and the NDPC as the law requires.
      </p>

      <h2>Children</h2>
      <p>Journol is for working journalists and editors. It is not meant for anyone under 18, and we don&apos;t knowingly collect their data.</p>

      <h2>Changes</h2>
      <p>If we change this policy in a way that matters, we&apos;ll update the date above and tell signed-in users.</p>
    </main>
  );
}
