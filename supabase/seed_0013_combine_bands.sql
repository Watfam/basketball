-- ============================================================================
-- Hardwood Lab — seed 0013: age and gender benchmark bands
--
-- Run after migrations/0012_combine_bands.sql.
--
-- Replaces the single default threshold set with six bands: under 13,
-- under 16 and 16-plus, each for male and female. The app picks the band
-- from birth_year and gender, and falls back to u16_m when either is
-- missing - stated in the UI rather than guessed at silently.
--
-- HOW THESE WERE DERIVED, because it matters for trusting them:
--
-- The u16 male column is the set I reasoned about directly. The other
-- five are scaled from it - skill tests move less with age and barely
-- with gender, power and speed tests move more with both. Free throws
-- are identical across every band on purpose: eight out of ten is eight
-- out of ten regardless of who shot them.
--
-- Where multiplication ran past physiology it was overridden by hand.
-- The generated 16-plus male sprint threshold was 2.9 seconds, faster
-- than NBA combine results, so the sprint bands for that age are set
-- directly instead.
--
-- These remain estimates. The u16 male column is the one to check
-- first, since every other column inherits its errors.
--
-- Dollar quoting throughout: see seed_0005.
-- ============================================================================

update hoops.assessment_drills set benchmarks = $hl${"u13_m":[8,11,14,17,19,22,24,27,30,34],"u13_f":[8,11,14,16,19,21,23,26,29,33],"u16_m":[10,14,18,21,24,27,30,34,38,42],"u16_f":[10,14,17,20,23,26,29,33,37,41],"u19_m":[11,15,19,23,26,29,32,37,41,45],"u19_f":[10,15,19,22,25,28,31,36,40,44]}$hl$::jsonb
where key = $hl$spot_shooting$hl$;

update hoops.assessment_drills set benchmarks = $hl${"u13_m":[1,2,3,4,5,6,7,8,9,10],"u13_f":[1,2,3,4,5,6,7,8,9,10],"u16_m":[1,2,3,4,5,6,7,8,9,10],"u16_f":[1,2,3,4,5,6,7,8,9,10],"u19_m":[1,2,3,4,5,6,7,8,9,10],"u19_f":[1,2,3,4,5,6,7,8,9,10]}$hl$::jsonb
where key = $hl$free_throws$hl$;

update hoops.assessment_drills set benchmarks = $hl${"u13_m":[24,30,36,42,46,51,56,61,66,72],"u13_f":[23,29,34,40,44,49,53,58,62,68],"u16_m":[30,38,45,52,58,64,70,76,82,90],"u16_f":[29,36,43,49,55,61,67,72,78,86],"u19_m":[32,41,49,56,63,69,76,82,89,97],"u19_f":[31,39,46,53,60,66,72,78,84,92]}$hl$::jsonb
where key = $hl$two_ball_30$hl$;

update hoops.assessment_drills set benchmarks = $hl${"u13_m":[23.8,21.9,20.6,19.5,18.5,17.5,16.5,15.6,14.8,13.8],"u13_f":[24.7,22.8,21.5,20.3,19.3,18.2,17.2,16.3,15.4,14.3],"u16_m":[19,17.5,16.5,15.6,14.8,14,13.2,12.5,11.8,11],"u16_f":[19.8,18.2,17.2,16.3,15.4,14.6,13.8,13,12.3,11.5],"u19_m":[17.6,16.2,15.3,14.4,13.7,13,12.2,11.6,10.9,10.2],"u19_f":[18.3,16.9,15.9,15,14.3,13.5,12.7,12.1,11.4,10.6]}$hl$::jsonb
where key = $hl$cone_slalom$hl$;

update hoops.assessment_drills set benchmarks = $hl${"u13_m":[10,12,14,17,19,22,24,26,29,32],"u13_f":[9,11,13,16,18,20,22,25,27,30],"u16_m":[12,15,18,21,24,27,30,33,36,40],"u16_f":[11,14,17,20,22,25,28,31,33,37],"u19_m":[13,16,19,23,26,29,32,36,39,43],"u19_f":[12,15,18,21,24,27,30,33,36,40]}$hl$::jsonb
where key = $hl$layups_60$hl$;

update hoops.assessment_drills set benchmarks = $hl${"u13_m":[8,10,12,13,15,17,19,22,24,27],"u13_f":[6,7,8,10,11,12,14,16,18,19],"u16_m":[10,12,14,16,18,20,23,26,29,32],"u16_f":[7,9,10,12,13,14,17,19,21,23],"u19_m":[11,13,15,17,19,21,25,28,31,34],"u19_f":[8,9,11,12,14,15,18,20,22,25]}$hl$::jsonb
where key = $hl$vertical_jump$hl$;

update hoops.assessment_drills set benchmarks = $hl${"u13_m":[5.6,5.24,5,4.76,4.58,4.4,4.23,4.05,3.87,3.69],"u13_f":[6.02,5.63,5.38,5.12,4.93,4.74,4.54,4.35,4.16,3.97],"u16_m":[4.7,4.4,4.2,4,3.85,3.7,3.55,3.4,3.25,3.1],"u16_f":[5.05,4.73,4.52,4.3,4.14,3.98,3.82,3.66,3.49,3.33],"u19_m":[4.5,4.25,4.05,3.9,3.75,3.6,3.45,3.3,3.15,3],"u19_f":[4.9,4.65,4.45,4.25,4.1,3.95,3.8,3.65,3.5,3.35]}$hl$::jsonb
where key = $hl$sprint_34$hl$;

update hoops.assessment_drills set benchmarks = $hl${"u13_m":[10,12,13,15,17,18,20,22,24,26],"u13_f":[9,11,12,14,15,17,19,20,22,24],"u16_m":[12,14,16,18,20,22,24,26,28,31],"u16_f":[11,13,15,17,18,20,22,24,26,29],"u19_m":[13,15,17,19,21,24,26,28,30,33],"u19_f":[12,14,16,18,20,22,24,26,28,31]}$hl$::jsonb
where key = $hl$defensive_slides_30$hl$;

update hoops.assessment_drills set benchmarks = $hl${"u13_m":[20.2,18.8,17.9,16.9,16.2,15.5,14.9,14.3,13.7,13.1],"u13_f":[21.5,20,19,18,17.2,16.5,15.8,15.2,14.6,13.9],"u16_m":[17,15.8,15,14.2,13.6,13,12.5,12,11.5,11],"u16_f":[18.1,16.8,16,15.1,14.5,13.8,13.3,12.8,12.2,11.7],"u19_m":[15.9,14.8,14,13.3,12.7,12.1,11.7,11.2,10.7,10.3],"u19_f":[16.9,15.7,14.9,14.1,13.5,12.9,12.4,11.9,11.4,10.9]}$hl$::jsonb
where key = $hl$lane_agility$hl$;
