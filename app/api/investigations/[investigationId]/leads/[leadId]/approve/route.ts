import "server-only";

import { NextResponse } from "next/server";
import { isClerkConfigured } from "@/lib/server/clerk-config";
import { isDatabaseConfigured } from "@/lib/server/database";
import { getOrCreateCurrentUser } from "@/lib/server/auth";
import { requireInvestigationAccess } from "@/lib/server/authorization";
import { getPostgresRepository } from "@/lib/server/postgres-repository";

type RouteContext = {
  params: Promise<{
    investigationId: string;
    leadId: string;
  }>;
};

export async function POST(
  _request: Request,
  context: RouteContext,
) {
  if (!isClerkConfigured()) {
    return NextResponse.json(
      { error: "Authentication is not configured." },
      { status: 503 },
    );
  }

  if (!isDatabaseConfigured()) {
    return NextResponse.json(
      { error: "Database persistence is not configured." },
      { status: 503 },
    );
  }

  const repository = getPostgresRepository();
  const user = await getOrCreateCurrentUser(repository);

  if (!user) {
    return NextResponse.json(
      { error: "Authentication is required." },
      { status: 401 },
    );
  }

  const { investigationId, leadId } = await context.params;

  try {
    await requireInvestigationAccess(
      repository,
      user,
      investigationId,
      "editor",
    );
  } catch {
    return NextResponse.json(
      { error: "Investigation not found." },
      { status: 404 },
    );
  }

  const lead = await repository.getLead(leadId);

  if (!lead || lead.investigationId !== investigationId) {
    return NextResponse.json(
      { error: "The investigative lead could not be found." },
      { status: 404 },
    );
  }

  if (!(await repository.investigationHasSource(investigationId, lead.sourceArticleId))) {
    return NextResponse.json(
      { error: "The investigative lead could not be found." },
      { status: 404 },
    );
  }

  if (lead.status === "approved") {
    return NextResponse.json({
      success: true,
      leadId: lead.id,
      status: lead.status,
      reused: true,
    });
  }

  if (lead.status !== "proposed") {
    return NextResponse.json(
      {
        error: `This lead cannot be approved because it is already ${lead.status}.`,
      },
      { status: 409 },
    );
  }

  const approvedLead = await repository.approveLead(
    lead.id,
    user.id,
  );

  if (!approvedLead) {
    return NextResponse.json(
      { error: "The investigative lead could not be approved." },
      { status: 500 },
    );
  }

  return NextResponse.json({
    success: true,
    leadId: approvedLead.id,
    status: approvedLead.status,
    reused: false,
  });
}
