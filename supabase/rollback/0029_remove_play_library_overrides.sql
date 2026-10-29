-- Undoes migration 0029_play_library_overrides.sql.
-- Drops every shared baseline correction. Each team's own hoops.play_edits override (migration 0028) is unaffected, and the static library (src/lib/plays/library.ts) is unaffected.

drop policy if exists play_library_overrides_coach_write on hoops.play_library_overrides;
drop policy if exists play_library_overrides_read on hoops.play_library_overrides;
drop table if exists hoops.play_library_overrides;
