import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { StoryView } from "@/app/story/[analysisId]/story-view";
import { requireUserId } from "@/lib/server/auth";
import { getAnalysis } from "@/lib/server/store";

type Props = { params: Promise<{ analysisId: string }> };

async function load(analysisId: string) {
  const userId = await requireUserId(`/story/${encodeURIComponent(analysisId)}`);
  return getAnalysis(userId, analysisId);
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { analysisId } = await params;
  const analysis = await load(analysisId).catch(() => null);
  return { title: analysis ? analysis.article.title : "Story" };
}

export default async function StoryPage({ params }: Props) {
  const { analysisId } = await params;
  const analysis = await load(analysisId);
  if (!analysis) notFound();
  return <StoryView analysis={analysis} />;
}
