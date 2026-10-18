-- Read-only. Run in the Supabase SQL editor. Answers: which login owns the Watford family, and which owns the team.
select 'household' as what, u.email, h.id, h.name, h.created_at,
       (select count(*) from hoops.players p where p.household_id = h.id) as players
from hoops.households h join auth.users u on u.id = h.owner_id
union all
select 'team', u.email, t.id, t.name, t.created_at, null
from hoops.teams t join auth.users u on u.id = t.owner_id
union all
select 'login', u.email, u.id, coalesce(u.raw_app_meta_data->>'provider', ''), u.created_at, null
from auth.users u
order by 1, 5;
