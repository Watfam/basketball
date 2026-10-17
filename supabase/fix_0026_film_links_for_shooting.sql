-- ============================================================================
-- Hardwood Lab — Film Room: connect existing lessons to the shooting drills they teach
--
-- Uses lessons and drills that already exist; adds no lesson, changes no web
-- address and creates no video link. It only fills the drill_id of a lesson that
-- has none:
--   Playing Without the Ball                      -> Catch-and-Shoot off the Pin-Down
--   Curry: Feet Ready Before the Ball Arrives     -> Catch-and-Shoot off the Pin-Down
--   Creating Separation Off the Bounce            -> Wing Step-Back
-- The study session Get Open Without the Ball is not linked to a drill (there is no such
-- relationship); the app shows it beside the drill because it contains the drill lessons.
--
-- Identifiers are looked up by exact title and exact drill name at run time, never typed in.
-- Each must match exactly one row or the file stops with a message and changes nothing.
-- A lesson that already points at a DIFFERENT drill is reported and left alone.
-- Safe to run twice. Run supabase/checks/film_links_check.sql before and after (read only).
--
-- Why this exists: the original film seed linked a lesson to a drill by name at the moment it ran, so
-- a lesson seeded before its drill existed ended up with no link. Whether yours did depends on the
-- order the files were run, which is why this looks the rows up instead of assuming.
--
-- To undo: supabase/rollback/0026_unlink_film_for_shooting.sql
--
-- Dollar quoting and no apostrophes in comments: see seed_0005.
-- ============================================================================

do $fix$
declare
  pair record;
  lesson_n int;
  drill_n int;
  v_lesson uuid;
  v_drill uuid;
  v_current uuid;
  session_n int;
begin
  for pair in
    select * from (values
      ($hl$Playing Without the Ball$hl$,                  $hl$Catch-and-Shoot off the Pin-Down$hl$),
      ($hl$Curry: Feet Ready Before the Ball Arrives$hl$, $hl$Catch-and-Shoot off the Pin-Down$hl$),
      ($hl$Creating Separation Off the Bounce$hl$,        $hl$Wing Step-Back$hl$)
    ) as v(lesson_title, drill_name)
  loop
    select count(*) into lesson_n from hoops.film_resources where title = pair.lesson_title;
    select count(*) into drill_n from hoops.drills where name = pair.drill_name;
    if lesson_n <> 1 or drill_n <> 1 then
      raise exception $msg$Lesson "%" matched % rows and drill "%" matched % rows; each must match exactly one. Nothing was changed by this pair or after it.$msg$, pair.lesson_title, lesson_n, pair.drill_name, drill_n;
    end if;
    select fr.id, fr.drill_id into v_lesson, v_current from hoops.film_resources fr where fr.title = pair.lesson_title;
    select d.id into v_drill from hoops.drills d where d.name = pair.drill_name;
    if v_current is null then
      update hoops.film_resources set drill_id = v_drill where id = v_lesson;
      raise notice $msg$Linked "%" to "%"$msg$, pair.lesson_title, pair.drill_name;
    elsif v_current = v_drill then
      raise notice $msg$"%" was already linked to "%"$msg$, pair.lesson_title, pair.drill_name;
    else
      raise notice $msg$"%" already points at a different drill; left alone$msg$, pair.lesson_title;
    end if;
  end loop;

  select count(*) into session_n from hoops.film_sessions where name = $hl$Get Open Without the Ball$hl$;
  if session_n <> 1 then
    raise notice $msg$The study session Get Open Without the Ball matched % rows; nothing to link, but check the Film Room$msg$, session_n;
  end if;
end
$fix$;
