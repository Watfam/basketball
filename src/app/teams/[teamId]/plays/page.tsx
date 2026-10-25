import { notFound, redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { PlayDesigner } from "@/components/plays/play-designer";

export default async function PlaysPage({ params }: { params: Promise<{ teamId: string }> }) {
  const { teamId } = await params;
  const supabase = await createClient();

  const [{ data: { user } }, { data: team }] = await Promise.all([
    supabase.auth.getUser(),
    supabase.schema("hoops").from("teams").select("id, name").eq("id", teamId).maybeSingle(),
  ]);

  if (!user) redirect("/login");
  if (!team) notFound();

  return <PlayDesigner teamId={teamId} teamName={team.name} />;
}
