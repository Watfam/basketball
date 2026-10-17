-- READ ONLY. Run in the Supabase SQL editor before and after fix_0026_film_links_for_shooting.sql. Changes nothing.

-- 1. The lessons and drills involved: each title and name must appear exactly once (the fix refuses otherwise).
select title, count(*) as rows_with_this_title from hoops.film_resources
where title in ('Playing Without the Ball', 'Curry: Feet Ready Before the Ball Arrives', 'Creating Separation Off the Bounce') group by title order by title;
select name, count(*) as rows_with_this_name from hoops.drills
where name in ('Catch-and-Shoot off the Pin-Down', 'Wing Step-Back') group by name order by name;

-- 2. Where each lesson points now (drill is empty when there is no link) and whether it has a video address at all.
select fr.id as lesson_id, fr.title, fr.drill_id, d.name as drill, (fr.url is not null) as has_video_address
from hoops.film_resources fr left join hoops.drills d on d.id = fr.drill_id
where fr.title in ('Playing Without the Ball', 'Curry: Feet Ready Before the Ball Arrives', 'Creating Separation Off the Bounce', 'Curry: The Two Seconds After the Pass', 'Footwork Into the Pull-Up')
order by fr.title;

-- 3. The study session and its lessons.
select s.id as session_id, s.name, i.sort_order, fr.title from hoops.film_sessions s
join hoops.film_session_items i on i.film_session_id = s.id join hoops.film_resources fr on fr.id = i.film_resource_id
where s.name = 'Get Open Without the Ball' order by i.sort_order;
