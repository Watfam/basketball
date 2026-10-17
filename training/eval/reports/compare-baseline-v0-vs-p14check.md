# Comparison

| Area | Verdict | Detail |
|---|---|---|
| shots/current_ball6_30fps | no change | V4 paired: 0 gained, 0 lost, net +0, exact p=1.000 |
| shots/current_ball6_15fps | no change | V4 paired: 0 gained, 0 lost, net +0, exact p=1.000 |
| detection/out_of_sample | no change | recall 66.7% -> 66.7% (+0.0 pts), precision 100.0% -> 100.0% (+0.0 pts); n=24 balls, 16 boxes; intervals overlap-check is left to the reader |
| localization | no change | median 0.81 -> 0.81 px, p95 1.74 -> 1.74 px; annotation repeatability floor about 0.50 px: differences below it are not claims |
| tracking/interpolation | no candidate | the candidate report has no method beyond the baselines |
| tracking/prediction | no candidate | the candidate report has no method beyond the baselines |
| performance/inference | no change | desktop median 119.3 -> 119.3 ms (0.0%); desktop numbers, not phone numbers |
