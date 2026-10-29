import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { AngleView } from "@/app/angle/[angleId]/angle-view";
import { isGuest, requireUserId } from "@/lib/server/auth";
import { feedbackFor, getAngle } from "@/lib/server/store";

type Props = { params: Promise<{ angleId: string }> };

async function load(angleId: string) {
  const userId = await requireUserId(`/angle/${encodeURIComponent(angleId)}`);
  return { userId, angle: await getAngle(userId, angleId) };
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { angleId } = await params;
  const loaded = await load(angleId).catch(() => null);
  return { title: loaded?.angle ? loaded.angle.headline : "Angle" };
}

export default async function AnglePage({ params }: Props) {
  const { angleId } = await params;
  const { userId, angle } = await load(angleId);
  if (!angle) notFound();
  const feedback = await feedbackFor(userId, [angle.id]).catch((): Record<string, "useful" | "not_useful"> => ({}));
  return <AngleView angle={angle} verdict={feedback[angle.id] ?? null} guest={await isGuest()} />;
}
