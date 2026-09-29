import { notFound, redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { FilmStudyPlayer, type StudyItem } from "@/components/film-study-player";

export default async function FilmStudySessionPage({
  params,
}: {
  params: Promise<{ playerId: string; filmSessionId: string }>;
}) {
  const { playerId, filmSessionId } = await params;
  const supabase = await createClient();

  // All four are independent — each needs only playerId/filmSessionId,
  // already known from params — parallel instead of stacked.
  const [{ data: { user } }, { data: session }, { data: itemRows }, { data: progress }] = await Promise.all([
    supabase.auth.getUser(),
    supabase.schema("hoops").from("film_sessions").select("id, name, description, outcome").eq("id", filmSessionId).maybeSingle(),
    supabase
      .schema("hoops")
      .from("film_session_items")
      .select(
        "id, sort_order, prompt, film_resources(id, title, url, kind, notes, watch_for, duration_seconds, pro_player_name)"
      )
      .eq("film_session_id", filmSessionId)
      .order("sort_order", { ascending: true }),
    supabase
      .schema("hoops")
      .from("film_session_progress")
      .select("completed_at, takeaway")
      .eq("player_id", playerId)
      .eq("film_session_id", filmSessionId)
      .maybeSingle(),
  ]);

  if (!user) redirect("/login");
  if (!session) notFound();

  const items: StudyItem[] = (itemRows ?? [])
    .map((row) => ({
      id: row.id,
      prompt: row.prompt,
      film: row.film_resources as unknown as StudyItem["film"],
    }))
    .filter((i) => Boolean(i.film));

  return (
    <div className="flex flex-1 flex-col justify-center px-4 py-6 sm:py-10">
      <FilmStudyPlayer
        playerId={playerId}
        filmSessionId={filmSessionId}
        sessionName={session.name}
        outcome={session.outcome}
        items={items}
        alreadyCompleted={Boolean(progress?.completed_at)}
        existingTakeaway={progress?.takeaway ?? null}
      />
    </div>
  );
}
