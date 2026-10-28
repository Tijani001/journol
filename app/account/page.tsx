import type { Metadata } from "next";
import Link from "next/link";
import { DeleteAccount } from "@/app/account/delete-account";
import { currentAccountId, isOwner, requireUserId } from "@/lib/server/auth";
import { usageToday } from "@/lib/server/quota";
import { listAnalyses, listSavedAngles } from "@/lib/server/store";

export const metadata: Metadata = { title: "Your account" };

export default async function AccountPage() {
  const userId = await requireUserId("/account");
  const [usage, stories, saved, accountId, owner] = await Promise.all([
    usageToday(userId),
    listAnalyses(userId),
    listSavedAngles(userId),
    currentAccountId(),
    isOwner(),
  ]);
  return (
    <main className="page" style={{ paddingTop: 40, maxWidth: 860 }}>
      <div className="list-head">
        <div>
          <h1>Your account</h1>
          <p>Your use of Journol, and your data.</p>
        </div>
      </div>

      <section className="ruled">
        <h2>Today</h2>
        <p>You&apos;ve used <strong>{usage.used} of {usage.limit}</strong> runs in the last 24 hours. Each new story and each &ldquo;Show different angles&rdquo; counts as one run.</p>
      </section>

      <section className="ruled">
        <h2>Your data</h2>
        <p>
          Journol keeps the {stories.length === 1 ? "story" : `${stories.length} stories`} you&apos;ve analysed and the {saved.length === 1 ? "angle" : `${saved.length} angles`} you&apos;ve saved,
          so you can come back to them. Read the <Link href="/privacy">privacy policy</Link> for what&apos;s kept and who processes it.
        </p>
        {accountId ? <p className="small muted">Your account ID: <code>{accountId}</code></p> : null}
        {owner ? <p><Link href="/admin">Open the owner dashboard →</Link></p> : null}
      </section>

      <section className="ruled">
        <h2>Delete your account</h2>
        <p>This permanently deletes every story, angle and note you have in Journol, and your sign-in account. It can&apos;t be undone.</p>
        <DeleteAccount />
      </section>
    </main>
  );
}
