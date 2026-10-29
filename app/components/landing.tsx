import Link from "next/link";
import { LinkForm } from "@/app/components/link-form";

/** What a visitor sees before signing in: what Journol does, how it works, and how it keeps itself honest. */
export function Landing() {
  return (
    <main className="page page-discover landing">
      <section className="hero">
        <h1>
          Every story leaves a question behind. <span className="hero-highlight">Find the one worth chasing.</span>
        </h1>
        <p>
          Paste a story that&apos;s already published. Journol reads it like an editor, checks what other outlets have
          reported, shows you what the story left out, and suggests follow-up angles you can actually report.
        </p>
        <LinkForm />
        <p className="small muted" style={{ margin: 0 }}>
          <strong>Try it now, no account needed.</strong> <Link href="/sign-up">Create a free account</Link> to analyse more stories,
          write pitches and keep your work on every device. Already have one? <Link href="/sign-in">Sign in</Link>.
        </p>
      </section>

      <section aria-labelledby="how-heading" className="landing-section">
        <h2 id="how-heading">How it works</h2>
        <ol className="how-steps">
          <li>
            <span className="how-number">1</span>
            <strong>Bring a story</strong>
            <span>Paste a link, pick one of today&apos;s stories, or paste the text of one behind a paywall.</span>
          </li>
          <li>
            <span className="how-number">2</span>
            <strong>Journol reads and searches</strong>
            <span>It reads the story and searches the web for related coverage: other outlets, earlier reporting on the same people and companies, and how similar promises turned out.</span>
          </li>
          <li>
            <span className="how-number">3</span>
            <strong>You get angles to chase</strong>
            <span>What the story leaves open, three angles with first steps, where to look and who to ask, and whether anyone has reported it yet.</span>
          </li>
        </ol>
      </section>

      <section aria-labelledby="honest-heading" className="landing-section">
        <h2 id="honest-heading">Leads you can trust enough to check</h2>
        <ul className="honest-list">
          <li><strong>Every quote is checked.</strong> If Journol says the story says something, those words are in the story.</li>
          <li><strong>Every outside claim is linked.</strong> Anything from another outlet links to where it was published.</li>
          <li><strong>Copies count once.</strong> A press release printed by ten outlets is one report, not ten.</li>
          <li><strong>&ldquo;Not yet reported&rdquo; means it searched.</strong> The label only appears when Journol searched related coverage and found nobody asking.</li>
        </ul>
        <div className="toolbar" style={{ marginTop: 24 }}>
          <Link href="/sign-up" className="button button-primary button-large">Create a free account</Link>
          <Link href="/app" className="button button-large">Get the app</Link>
        </div>
      </section>
    </main>
  );
}
