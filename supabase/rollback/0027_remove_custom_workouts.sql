-- Undo migration 0027. Refuses to run while any family-built workout exists,
-- because removing the owner column would turn those workouts into library
-- workouts that every family could see. Delete or export them first.
do $guard$
declare n int;
begin
  select count(*) into n from hoops.workouts where owner_household_id is not null;
  if n > 0 then
    raise exception $msg$There are % family-built workouts. Nothing was changed. Delete them first (they are the workouts with an owner_household_id).$msg$, n;
  end if;
end
$guard$;

drop policy if exists workout_drills_owner_delete on hoops.workout_drills;
drop policy if exists workout_drills_owner_update on hoops.workout_drills;
drop policy if exists workout_drills_owner_insert on hoops.workout_drills;
drop policy if exists workout_drills_read on hoops.workout_drills;
create policy workout_drills_read_all on hoops.workout_drills for select using (auth.role() = 'authenticated');

drop policy if exists workouts_owner_delete on hoops.workouts;
drop policy if exists workouts_owner_update on hoops.workouts;
drop policy if exists workouts_owner_insert on hoops.workouts;
drop policy if exists workouts_read on hoops.workouts;
create policy workouts_read_all on hoops.workouts for select using (auth.role() = 'authenticated');

drop index if exists hoops.workouts_owner_household_idx;
alter table hoops.workouts drop column if exists owner_household_id;
