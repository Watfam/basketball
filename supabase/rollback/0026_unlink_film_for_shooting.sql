-- Undo for fix_0026. If the fix reported a lesson as already linked, that link was there before it and this would remove it: skip that lesson.
-- Undo for fix_0026: clears the drill link of exactly these three lessons, and only where it points at the drill the fix set.
update hoops.film_resources fr set drill_id = null
from hoops.drills d
where fr.drill_id = d.id and (
  (fr.title in ('Playing Without the Ball', 'Curry: Feet Ready Before the Ball Arrives') and d.name = 'Catch-and-Shoot off the Pin-Down')
  or (fr.title = 'Creating Separation Off the Bounce' and d.name = 'Wing Step-Back')
);
