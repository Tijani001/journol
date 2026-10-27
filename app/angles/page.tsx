import type { Metadata } from "next";
import { SavedAngles } from "@/app/angles/saved-angles";
import { requireUserId } from "@/lib/server/auth";
import { listSavedAngles } from "@/lib/server/store";

export const metadata: Metadata = { title: "My angles" };

export default async function MyAnglesPage() {
  const userId = await requireUserId("/angles");
  const angles = await listSavedAngles(userId);
  return (
    <main className="page" style={{ paddingTop: 40, gap: 24 }}>
      <SavedAngles angles={angles} now={new Date().toISOString()} />
    </main>
  );
}
