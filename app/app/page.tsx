import type { Metadata } from "next";
import { InstallApp } from "@/app/app/install-app";

export const metadata: Metadata = { title: "Get the app" };

export default function GetTheAppPage() {
  return (
    <main className="page" style={{ paddingTop: 40, maxWidth: 860 }}>
      <div className="list-head">
        <div>
          <h1>Get the Journol app</h1>
          <p>Put Journol on your phone&apos;s home screen or your computer&apos;s dock. It opens full-screen like any other app, with no app store needed.</p>
        </div>
      </div>
      <InstallApp />
      <section className="ruled">
        <h2>Good to know</h2>
        <ul className="plain-list">
          <li><strong>It&apos;s the same Journol.</strong> Your stories and saved angles are the same in the app and on the website.</li>
          <li><strong>Updates arrive by themselves.</strong> There&apos;s nothing to update; you always get the latest version.</li>
          <li><strong>It takes almost no space.</strong> The app is a few hundred kilobytes, not a big download.</li>
          <li><strong>You still need the internet</strong> to read stories and search other outlets.</li>
        </ul>
      </section>
    </main>
  );
}
