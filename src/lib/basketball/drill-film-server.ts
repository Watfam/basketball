import type { createClient } from "@/lib/supabase/server";
import type { Lesson, StudySession } from "@/lib/basketball/drill-film";

type Supabase = Awaited<ReturnType<typeof createClient>>;

/**
 * What the screens that show a shooting drill need from the Film Room, read only: the existing shooting lessons, the video links this household
 * attached, and which lessons this player has watched. Nothing is written and no lesson is copied.
 */
export async function loadLessonContext(supabase: Supabase, playerId: string, householdId: string | null) {
  const hoops = supabase.schema("hoops");
  const [{ data: lessons }, { data: views }, { data: links }, { data: items }] = await Promise.all([
    hoops.from("film_resources").select("id, title, url, watch_for, notes, skill_tags, drill_id, sort_order").contains("skill_tags", ["shooting"]),
    hoops.from("film_views").select("film_resource_id").eq("player_id", playerId),
    householdId ? hoops.from("film_links").select("film_resource_id, url").eq("household_id", householdId) : Promise.resolve({ data: [] as { film_resource_id: string; url: string }[] }),
    hoops.from("film_session_items").select("film_resource_id, film_sessions(id, name)"),
  ]);
  // The existing study sessions (courses) and the lessons in each; a session is shown with a drill only when it holds that drill's own linked lessons.
  const bySession = new Map<string, StudySession>();
  for (const it of (items ?? []) as unknown as { film_resource_id: string; film_sessions: { id: string; name: string } | { id: string; name: string }[] | null }[]) {
    const fs = Array.isArray(it.film_sessions) ? it.film_sessions[0] : it.film_sessions;
    if (!fs) continue;
    const cur = bySession.get(fs.id) ?? { id: fs.id, name: fs.name, lessonIds: [] };
    cur.lessonIds.push(it.film_resource_id);
    bySession.set(fs.id, cur);
  }
  return {
    lessons: (lessons ?? []) as Lesson[],
    householdLinks: new Map((links ?? []).map((l) => [l.film_resource_id as string, l.url as string])),
    watched: new Set((views ?? []).map((v) => v.film_resource_id as string)),
    studySessions: [...bySession.values()],
  };
}
