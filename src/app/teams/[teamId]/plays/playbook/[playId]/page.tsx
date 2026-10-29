import { notFound, redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { PlayViewer } from "@/components/plays/play-viewer";
import { LIBRARY_PLAYS } from "@/lib/plays/library";

export default async function PlayViewPage({ params }: { params: Promise<{ teamId: string; playId: string }> }) {
  const { teamId, playId } = await params;
  const supabase = await createClient();

  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const play = LIBRARY_PLAYS.find((p) => p.id === playId);
  if (!play) notFound();

  return (
    <div className="flex flex-1 flex-col">
      <main className="mx-auto w-full max-w-lg flex-1 px-4 py-5 sm:py-8">
        <PlayViewer play={play} teamId={teamId} />
      </main>
    </div>
  );
}
