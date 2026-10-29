import type { Metadata } from "next";
import Link from "next/link";
import { DeleteAccount } from "@/app/account/delete-account";
import { currentAccountId, isGuest, isOwner, requireUserId } from "@/lib/server/auth";
import { usageToday } from "@/lib/server/quota";
import { listAnalyses, listSavedAngles } from "@/lib/server/store";

export const metadata: Metadata = { title: "Your account" };

export default async function AccountPage() {
  const userId = await requireUserId("/account");
  const guest = await isGuest();
  const [usage, stories, saved, accountId, owner] = await Promise.all([
    usageToday(userId, guest),
    listAnalyses(userId),
    listSavedAngles(userId),
    currentAccountId(),
    isOwner(),
  ]);
  const work = `the ${stories.length === 1 ? "story" : `${stories.length} stories`} you've analysed and the ${saved.length === 1 ? "angle" : `${saved.length} angles`} you've saved`;

  return (
    <main className="page" style={{ paddingTop: 40, maxWidth: 860 }}>
      <div className="list-head">
        <div>
          <h1>{guest ? "You're using Journol as a guest" : "Your account"}</h1>
          <p>{guest ? "Your work is kept on this browser only, for 30 days." : "Your use of Journol, and your data."}</p>
        </div>
      </div>

      {guest ? (
        <section className="account-prompt">
          <p>
            <strong>Create a free account</strong> to analyse up to 15 stories a day instead of {usage.limit}, write pitches, and use
            Journol on any device. Everything you&apos;ve done as a guest moves into your account.
          </p>
          <div className="toolbar">
            <Link href="/sign-up?redirect_url=%2Fstories" className="button button-primary">Create a free account</Link>
            <Link href="/sign-in?redirect_url=%2Fstories" className="button">Sign in</Link>
          </div>
        </section>
      ) : null}

      <section className="ruled">
        <h2>Today</h2>
        <p>
          {guest
            ? <>You&apos;ve analysed <strong>{usage.used} of {usage.limit}</strong> free stories in the last 24 hours.</>
            : <>You&apos;ve used <strong>{usage.used} of {usage.limit}</strong> runs in the last 24 hours. Each new story, each &ldquo;More angles&rdquo; and each pitch counts as one run.</>}
        </p>
      </section>

      <section className="ruled">
        <h2>Your data</h2>
        <p>
          Journol keeps {work}, so you can come back to them.{guest ? " As a guest, it's deleted after 30 days unless you create an account." : ""}{" "}
          Read the <Link href="/privacy">privacy policy</Link> for what&apos;s kept and who processes it.
        </p>
        {accountId ? <p className="small muted">Your account ID: <code>{accountId}</code></p> : null}
        {owner ? <p><Link href="/admin">Open the owner dashboard →</Link></p> : null}
      </section>

      <section className="ruled">
        <h2>{guest ? "Delete your guest work" : "Delete your account"}</h2>
        <p>
          {guest
            ? "This permanently deletes every story and angle you have as a guest on this browser. It can't be undone."
            : "This permanently deletes every story, angle and note you have in Journol, and your sign-in account. It can't be undone."}
        </p>
        <DeleteAccount guest={guest} />
      </section>
    </main>
  );
}
