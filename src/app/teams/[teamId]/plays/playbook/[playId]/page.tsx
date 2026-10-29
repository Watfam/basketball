import { notFound, redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { PlayViewer } from "@/components/plays/play-viewer";
import { LIBRARY_PLAYS } from "@/lib/plays/library";
import { getPlayEdit } from "@/lib/plays/play-edits-store";
import { applyEdit } from "@/lib/plays/merge-edits";

export default async function PlayViewPage({ params }: { params: Promise<{ teamId: string; playId: string }> }) {
  const { teamId, playId } = await params;
  const supabase = await createClient();

  const basePlay = LIBRARY_PLAYS.find((p) => p.id === playId);
  if (!basePlay) notFound();

  const hoops = supabase.schema("hoops");
  const [{ data: { user } }, { data: team }, edit] = await Promise.all([
    supabase.auth.getUser(),
    hoops.from("teams").select("owner_id").eq("id", teamId).maybeSingle(),
    getPlayEdit(hoops, teamId, playId),
  ]);

  if (!user) redirect("/login");

  let canEdit = team?.owner_id === user.id;
  if (!canEdit) {
    const { data: membership } = await hoops
      .from("team_members")
      .select("role")
      .eq("team_id", teamId)
      .eq("user_id", user.id)
      .maybeSingle();
    canEdit = membership?.role === "coach" || membership?.role === "assistant_coach";
  }

  const play = applyEdit(basePlay, edit);

  return (
    <div className="flex flex-1 flex-col">
      <main className="mx-auto w-full max-w-lg flex-1 px-4 py-5 sm:py-8">
        <PlayViewer play={play} teamId={teamId} canEdit={canEdit} />
      </main>
    </div>
  );
}
