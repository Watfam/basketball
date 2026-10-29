import { notFound, redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { PlayDesigner } from "@/components/plays/play-designer";
import { LIBRARY_PLAYS } from "@/lib/plays/library";
import { getMasterOverride, getPlayEdit } from "@/lib/plays/play-edits-store";
import { resolvePlay } from "@/lib/plays/merge-edits";

export default async function PlaysPage({
  params,
  searchParams,
}: {
  params: Promise<{ teamId: string }>;
  searchParams: Promise<{ lib?: string }>;
}) {
  const { teamId } = await params;
  const { lib } = await searchParams;
  const supabase = await createClient();

  const [{ data: { user } }, { data: team }] = await Promise.all([
    supabase.auth.getUser(),
    supabase.schema("hoops").from("teams").select("id").eq("id", teamId).maybeSingle(),
  ]);

  if (!user) redirect("/login");
  if (!team) notFound();

  const basePlay = lib ? LIBRARY_PLAYS.find((p) => p.id === lib) : undefined;
  const hoops = supabase.schema("hoops");
  const [master, edit] = basePlay
    ? await Promise.all([getMasterOverride(hoops, basePlay.id), getPlayEdit(hoops, teamId, basePlay.id)])
    : [null, null];
  const libraryPlay = basePlay ? resolvePlay(basePlay, master, edit) : undefined;

  return (
    <PlayDesigner
      teamId={teamId}
      libraryPlayId={libraryPlay?.id}
      initialFrames={libraryPlay?.frames}
      initialPlayName={libraryPlay?.name}
      initialVs={libraryPlay?.vs}
      initialAbout={libraryPlay?.about}
      initialKeys={libraryPlay?.keys}
    />
  );
}
