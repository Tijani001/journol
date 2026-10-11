export const instant = false;

import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { getOrCreateCurrentUser } from "@/lib/server/auth";
import { isClerkConfigured } from "@/lib/server/clerk-config";
import { isDatabaseConfigured } from "@/lib/server/database";
import { getPostgresRepository } from "@/lib/server/postgres-repository";
import { AuthorizationError, requireInvestigationAccess } from "@/lib/server/authorization";
import { AuthControls } from "@/app/auth-controls";

type InvestigationPageProps = {
  params: Promise<{
    investigationId: string;
  }>;
};

export default async function InvestigationPage({
  params,
}: InvestigationPageProps) {
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

  const { investigationId } = await params;
  const repository = getPostgresRepository();
  const user = await getOrCreateCurrentUser(repository);

  if (!user) {
    redirect("/sign-in");
  }

  let investigation;
  try {
    investigation = await requireInvestigationAccess(repository, user, investigationId);
  } catch (error) {
    if (error instanceof AuthorizationError) notFound();
    throw error;
  }

  const lead = investigation.currentLeadId
    ? await repository.getLead(investigation.currentLeadId)
    : null;
  const assessment = investigation.currentEvidenceAssessmentId
    ? await repository.getEvidenceAssessment(investigation.currentEvidenceAssessmentId)
    : null;
  const plan = investigation.currentPlanId
    ? await repository.getInvestigationPlan(investigation.currentPlanId)
    : null;
  const source = lead ? await repository.getSourceArticle(lead.sourceArticleId) : null;

  return (
    <main className="mx-auto w-full max-w-4xl p-6">
      <header className="flex items-center justify-between gap-4"><Link className="text-sm underline" href="/workspace">← Back to investigations</Link><AuthControls /></header>

      <header className="mt-6">
        <p className="text-sm">Investigation</p>

        <h1 className="mt-1 text-3xl font-semibold">
          {investigation.title}
        </h1>

        <p className="mt-2 text-sm">
          Status: {investigation.status}
        </p>
      </header>

      <section className="mt-8 rounded-lg border p-5">
        <h2 className="text-lg font-semibold">Investigation workspace</h2>

        <p className="mt-2 text-sm">
          Your investigation is now stored in Journol and belongs to your
          authenticated account.
        </p>

        <dl className="mt-5 space-y-3 text-sm">
          <div>
            <dt className="font-medium">Created</dt>
            <dd>{investigation.createdAt.toLocaleString()}</dd>
          </div>

          <div>
            <dt className="font-medium">Last updated</dt>
            <dd>{investigation.updatedAt.toLocaleString()}</dd>
          </div>

          <div>
            <dt className="font-medium">Investigation ID</dt>
            <dd className="break-all font-mono text-xs">
              {investigation.id}
            </dd>
          </div>
        </dl>
      </section>

      <section className="mt-6 rounded-lg border p-5">
        <h2 className="text-lg font-semibold">Story discovery</h2>

        <p className="mt-2 text-sm">
          Find news signals and turn relevant developments into an
          evidence-backed investigative lead for this investigation.
        </p>

        <Link
          className="mt-4 inline-block rounded-md border px-4 py-2 text-sm font-medium"
          href={`/?investigationId=${encodeURIComponent(investigation.id)}`}
        >
          Discover stories →
        </Link>
      </section>

      <section className="mt-6 rounded-lg border p-5">
        <h2 className="text-lg font-semibold">Saved investigation</h2>
        {source && <p className="mt-2 text-sm"><a className="underline" href={source.originalUrl} rel="noreferrer" target="_blank">{source.title || "Original source"}</a>{source.publisher ? ` · ${source.publisher}` : ""}</p>}
        {lead && <div className="mt-4"><h3 className="font-medium">Investigative lead</h3><p className="mt-1 text-sm">{typeof lead.content.primaryLead === "string" ? lead.content.primaryLead : "Saved lead"}</p></div>}
        {assessment && <p className="mt-4 text-sm text-slate-600">Evidence assessment saved.</p>}
        {plan && <div className="mt-4"><h3 className="font-medium">Investigation plan</h3><p className="mt-1 text-sm">{typeof plan.content.investigativeObjective === "string" ? plan.content.investigativeObjective : "Saved plan"}</p></div>}
        {!lead && <p className="mt-3 text-sm text-slate-600">No lead has been saved yet.</p>}
      </section>

      <section className="mt-6 rounded-lg border p-5">
        <h2 className="text-lg font-semibold">Workflow</h2>

        <ul className="mt-3 space-y-2 text-sm">
          <li>
            {investigation.currentLeadId
              ? "✓ Investigative lead available"
          : "○ No investigative lead yet"}
          </li>

          <li>
            {investigation.currentEvidenceAssessmentId
              ? "✓ Evidence assessment available"
              : "○ No evidence assessment yet"}
          </li>

          <li>
            {investigation.currentPlanId
              ? "✓ Investigation plan available"
              : "○ No investigation plan yet"}
          </li>
        </ul>
      </section>
    </main>
  );
}
