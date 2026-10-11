export const instant = false;

import Link from "next/link";
import { redirect } from "next/navigation";
import { getOrCreateCurrentUser } from "@/lib/server/auth";
import { isClerkConfigured } from "@/lib/server/clerk-config";
import { isDatabaseConfigured } from "@/lib/server/database";
import { getPostgresRepository } from "@/lib/server/postgres-repository";
import { NewInvestigationForm } from "./new-investigation-form";
import { AuthControls } from "@/app/auth-controls";

export default async function WorkspacePage() {
  if (!isClerkConfigured()) {
    return (
      <main className="p-6">
        Authentication is not configured for this environment.
      </main>
    );
  }

  if (!isDatabaseConfigured()) {
    return (
      <main className="p-6">
        Database persistence is not configured for this environment.
      </main>
    );
  }

  const repository = getPostgresRepository();
  const user = await getOrCreateCurrentUser(repository);

  if (!user) redirect("/sign-in");

  const investigations =
    await repository.listInvestigationsForOwner(user.id);

  return (
    <main className="mx-auto w-full max-w-3xl p-6">
      <header className="flex items-center justify-between gap-4">
        <div><p className="text-xs font-semibold tracking-widest text-[#5b5bc7]">JOURNOL</p><h1 className="text-2xl font-semibold">Your investigations</h1></div>
        <AuthControls />
      </header>

      <p className="mt-2 text-sm text-slate-600">
        Your work is private to your authenticated Journol account. Continue an
        investigation or start one to save sources and editorial outputs.
      </p>

      <NewInvestigationForm />

      <ul className="mt-6 space-y-2">
        {investigations.map((investigation) => (
          <li className="rounded-lg border p-4" key={investigation.id}>
            <Link
              className="block rounded-md focus:outline-none focus:ring-2 focus:ring-[#5b5bc7]"
              href={`/workspace/${investigation.id}`}
            >
              <div className="flex items-center justify-between gap-3">
                <strong>{investigation.title}</strong>
                <span className="text-xs text-slate-500">{investigation.status}</span>
              </div>
              <p className="mt-1 text-xs text-slate-500">
                Updated {investigation.updatedAt.toLocaleDateString()}
              </p>
            </Link>
          </li>
        ))}

        {investigations.length === 0 && (
          <li className="rounded-lg border border-dashed p-6 text-sm text-slate-600">Create your first investigation to save source material, proposed leads, evidence assessments, and plans.</li>
        )}
      </ul>
    </main>
  );
}
