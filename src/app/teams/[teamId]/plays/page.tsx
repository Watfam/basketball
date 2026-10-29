import { notFound, redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { PlayDesigner } from "@/components/plays/play-designer";
import { LIBRARY_PLAYS } from "@/lib/plays/library";

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

  const libraryPlay = lib ? LIBRARY_PLAYS.find((p) => p.id === lib) : undefined;

  return <PlayDesigner teamId={teamId} initialFrames={libraryPlay?.frames} initialPlayName={libraryPlay?.name} />;
}
