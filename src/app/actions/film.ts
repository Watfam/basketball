"use server";

/** The film room: views, study sessions, links and added film. */

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";

/**
 * Marks a film watched and saves the takeaway. The takeaway is the whole
 * point of the interaction — watching without writing down what you're
 * taking into the next session is scrolling, not studying — so this
 * upserts rather than inserting: a player can come back and change what
 * they wrote.
 */
export async function logFilmView(playerId: string, filmResourceId: string, takeaway: string) {
  if (!playerId || !filmResourceId) return { error: "Missing player or film." };

  const supabase = await createClient();
  const { error } = await supabase
    .schema("hoops")
    .from("film_views")
    .upsert(
      {
        player_id: playerId,
        film_resource_id: filmResourceId,
        watched_at: new Date().toISOString(),
        takeaway: takeaway.trim() || null,
      },
      { onConflict: "player_id,film_resource_id" }
    );

  if (error) return { error: error.message };

  revalidatePath(`/players/${playerId}/film`);
  revalidatePath(`/players/${playerId}`);
  revalidatePath(`/players/${playerId}/me`);
  return { error: null };
}

/**
 * Finishes a film study session. Marks every lesson in it studied too —
 * a player who has worked through the whole course has, by definition,
 * studied its parts, and making them mark each one again is busywork.
 */
export async function completeFilmSession(
  playerId: string,
  filmSessionId: string,
  takeaway: string,
  filmResourceIds: string[]
) {
  if (!playerId || !filmSessionId) return { error: "Missing player or session." };

  const supabase = await createClient();

  const { error } = await supabase
    .schema("hoops")
    .from("film_session_progress")
    .upsert(
      {
        player_id: playerId,
        film_session_id: filmSessionId,
        completed_at: new Date().toISOString(),
        takeaway: takeaway.trim() || null,
      },
      { onConflict: "player_id,film_session_id" }
    );

  if (error) return { error: error.message };

  if (filmResourceIds.length > 0) {
    // Existing views are left alone so a takeaway a player already wrote
    // on an individual lesson isn't overwritten by finishing the course.
    const { data: existing } = await supabase
      .schema("hoops")
      .from("film_views")
      .select("film_resource_id")
      .eq("player_id", playerId)
      .in("film_resource_id", filmResourceIds);

    const already = new Set((existing ?? []).map((v) => v.film_resource_id));
    const toInsert = filmResourceIds
      .filter((id) => !already.has(id))
      .map((id) => ({ player_id: playerId, film_resource_id: id }));

    if (toInsert.length > 0) {
      await supabase.schema("hoops").from("film_views").insert(toInsert);
    }
  }

  revalidatePath(`/players/${playerId}/film`);
  revalidatePath(`/players/${playerId}`);
  revalidatePath(`/players/${playerId}/me`);
  return { error: null };
}

export async function removeFilmView(playerId: string, filmResourceId: string) {
  if (!playerId || !filmResourceId) return { error: "Missing player or film." };

  const supabase = await createClient();
  const { error } = await supabase
    .schema("hoops")
    .from("film_views")
    .delete()
    .eq("player_id", playerId)
    .eq("film_resource_id", filmResourceId);

  if (error) return { error: error.message };

  revalidatePath(`/players/${playerId}/film`);
  return { error: null };
}

/**
 * Adds a household's own film link.
 *
 * The curated library ships without video URLs on purpose — inventing
 * plausible-looking links would be worse than having none — so this is
 * how real links actually get in. Rows created here carry the household
 * id, which is what keeps them out of everyone else's library (see the
 * film_resources RLS policies in migration 0004).
 */
export async function addFilmResource(
  householdId: string,
  playerId: string,
  input: { title: string; url: string; kind: string; skillTags: string[]; notes: string }
) {
  if (!householdId) return { error: "Missing household." };

  const title = input.title.trim();
  const url = input.url.trim();
  if (!title) return { error: "Give it a title." };

  // Only http(s) — a javascript: or data: URL pasted in here would
  // otherwise be rendered as a link for the player to tap.
  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    return { error: "That doesn't look like a link. Paste the full URL, starting with https://" };
  }
  if (parsed.protocol !== "https:" && parsed.protocol !== "http:") {
    return { error: "Links have to start with https://" };
  }

  const supabase = await createClient();
  const { error } = await supabase
    .schema("hoops")
    .from("film_resources")
    .insert({
      title,
      url: parsed.toString(),
      kind: input.kind || null,
      skill_tags: input.skillTags,
      notes: input.notes.trim() || null,
      added_by_household_id: householdId,
    });

  if (error) return { error: error.message };

  revalidatePath(`/players/${playerId}/film`);
  return { error: null };
}

/**
 * Attaches a household's own video link to a curated lesson.
 *
 * Curated rows are service-role only and shared across everyone, so this
 * stores the URL alongside rather than editing the lesson. The app
 * prefers the override when rendering. Previously the only option was to
 * create a whole second entry, which left a duplicate sitting next to the
 * lesson it was meant to complete.
 */
export async function setFilmLink(
  householdId: string,
  filmResourceId: string,
  url: string,
  playerId: string
) {
  if (!householdId || !filmResourceId) return { error: "Missing household or film." };

  let parsed: URL;
  try {
    parsed = new URL(url.trim());
  } catch {
    return { error: "That doesn't look like a link. Paste the full URL, starting with https://" };
  }
  if (parsed.protocol !== "https:" && parsed.protocol !== "http:") {
    return { error: "Links have to start with https://" };
  }

  const supabase = await createClient();
  const { error } = await supabase
    .schema("hoops")
    .from("film_links")
    .upsert(
      { household_id: householdId, film_resource_id: filmResourceId, url: parsed.toString() },
      { onConflict: "household_id,film_resource_id" }
    );

  if (error) return { error: error.message };

  revalidatePath(`/players/${playerId}/film`);
  return { error: null };
}

export async function removeFilmLink(
  householdId: string,
  filmResourceId: string,
  playerId: string
) {
  if (!householdId || !filmResourceId) return { error: "Missing household or film." };

  const supabase = await createClient();
  const { error } = await supabase
    .schema("hoops")
    .from("film_links")
    .delete()
    .eq("household_id", householdId)
    .eq("film_resource_id", filmResourceId);

  if (error) return { error: error.message };

  revalidatePath(`/players/${playerId}/film`);
  return { error: null };
}

export async function deleteFilmResource(filmResourceId: string, playerId: string) {
  if (!filmResourceId) return { error: "Missing film." };

  const supabase = await createClient();
  // RLS (film_resources_own_write) already restricts this to rows the
  // caller's household added — curated rows can't be deleted here.
  const { error } = await supabase
    .schema("hoops")
    .from("film_resources")
    .delete()
    .eq("id", filmResourceId);

  if (error) return { error: error.message };

  revalidatePath(`/players/${playerId}/film`);
  return { error: null };
}
