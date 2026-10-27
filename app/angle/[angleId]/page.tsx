import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { AngleView } from "@/app/angle/[angleId]/angle-view";
import { requireUserId } from "@/lib/server/auth";
import { getAngle } from "@/lib/server/store";

type Props = { params: Promise<{ angleId: string }> };

async function load(angleId: string) {
  const userId = await requireUserId(`/angle/${encodeURIComponent(angleId)}`);
  return getAngle(userId, angleId);
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { angleId } = await params;
  const angle = await load(angleId).catch(() => null);
  return { title: angle ? angle.headline : "Angle" };
}

export default async function AnglePage({ params }: Props) {
  const { angleId } = await params;
  const angle = await load(angleId);
  if (!angle) notFound();
  return <AngleView angle={angle} />;
}
