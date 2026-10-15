import type { createClient } from "@/lib/supabase/server";
import type { Lesson } from "@/lib/basketball/drill-film";

type Supabase = Awaited<ReturnType<typeof createClient>>;

/**
 * What the screens that show a shooting drill need from the Film Room, read only: the existing shooting lessons, the video links this household
 * attached, and which lessons this player has watched. Nothing is written and no lesson is copied.
 */
export async function loadLessonContext(supabase: Supabase, playerId: string, householdId: string | null) {
  const hoops = supabase.schema("hoops");
  const [{ data: lessons }, { data: views }, { data: links }] = await Promise.all([
    hoops.from("film_resources").select("id, title, url, watch_for, notes, skill_tags, drill_id, sort_order").contains("skill_tags", ["shooting"]),
    hoops.from("film_views").select("film_resource_id").eq("player_id", playerId),
    householdId ? hoops.from("film_links").select("film_resource_id, url").eq("household_id", householdId) : Promise.resolve({ data: [] as { film_resource_id: string; url: string }[] }),
  ]);
  return {
    lessons: (lessons ?? []) as Lesson[],
    householdLinks: new Map((links ?? []).map((l) => [l.film_resource_id as string, l.url as string])),
    watched: new Set((views ?? []).map((v) => v.film_resource_id as string)),
  };
}
