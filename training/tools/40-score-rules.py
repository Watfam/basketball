"""Scores two rim rules side by side against a shooter's written list.

  python3 40-score-rules.py <dets.json> <candidates.json> <rimX> <rimY> <truth.json> [skip candidate numbers, comma separated]

Candidates are matched to the written list in order. If their number equals the number of written shots (after any listed skips)
the match is 1 to 1 and independent of both rules; otherwise it falls back to the dynamic-programming alignment of tool 38,
which uses the rule's own agreement and so flatters it; the script says which was used.

RULE V1 (fixed before any exam clip, tools 35/38): make if a ball >= 18 px wide is seen at least 30 px below the rim and within
45 px sideways in the 40 frames after the ball is first seen in the rim zone, else miss.

RULE V2 (written 2026-10-05 from the evidence in IMG_4836 and IMG_4839 only, before IMG_4840 was scored):
  1. the window after first rim-zone sight is 70 frames, not 40 (a ball that rolls around the rim before dropping, 4839 shot 16);
  2. a ball seen below the net is NOT a make if it looks much bigger there than at the rim, i.e. the median width of its first 8
     below-net detections is >= 26 px AND >= 1.2 times the median width of the zone detections in the 10 frames after first
     rim-zone sight. A ball falling in front of the hoop is nearer the camera. This came from 4 misses among 34 shots with a
     ball seen below the net, so it is a hypothesis, not an established fact.
Nothing in V2 handles a person hiding the ball under the net (two of the six 4839 errors): no cue for it was found."""
import json, sys, statistics as st

dets = json.load(open(sys.argv[1]))["detections"]
cands = json.load(open(sys.argv[2]))
rx, ry = float(sys.argv[3]), float(sys.argv[4])
T = json.load(open(sys.argv[5]))["results"]
skips = {int(x) for x in sys.argv[6].split(",")} if len(sys.argv) > 6 and sys.argv[6] else set()
fps = 30000 / 1001
byf = {}
for d in dets:
    byf.setdefault(d["f"], []).append(d)
cx = lambda d: (d["x1"] + d["x2"]) / 2
cy = lambda d: (d["y1"] + d["y2"]) / 2
wd = lambda d: d["x2"] - d["x1"]


def calls(c):
    f0, f1 = c["start"], c["end"]
    inz = [d for f in range(f0 - 6, f1 + 1) for d in byf.get(f, []) if abs(cx(d) - rx) <= 55 and ry - 50 <= cy(d) <= ry + 45]
    first = min((d["f"] for d in inz), default=f0)
    zone_w = [wd(d) for d in inz if d["f"] <= first + 10]

    def below(win):
        return [d for f in range(first, first + win) for d in byf.get(f, []) if abs(cx(d) - rx) <= 45 and cy(d) >= ry + 30 and wd(d) >= 18]

    b1, b2 = below(40), below(70)
    v1 = "make" if b1 else "miss"
    v2 = "make" if b2 else "miss"
    if b2 and zone_w:
        bw = st.median(wd(d) for d in b2[:8]); zw = st.median(zone_w)
        if bw >= 26 and bw >= 1.2 * zw:
            v2 = "miss"
    return v1, v2


rows = [(i + 1,) + calls(c) + (round(c["start"] / fps, 1),) for i, c in enumerate(cands) if (i + 1) not in skips]
M = len(T)
if len(rows) == M:
    pairs = list(zip(rows, T)); how = "1 to 1 in order (independent of both rules)"
else:
    N, NEG = len(rows), -1e9
    dp = [[NEG] * (M + 1) for _ in range(N + 1)]; bk = [[None] * (M + 1) for _ in range(N + 1)]; dp[0][0] = 0
    for i in range(N + 1):
        for j in range(M + 1):
            v = dp[i][j]
            if v == NEG: continue
            if i < N and v - 1 > dp[i + 1][j]: dp[i + 1][j] = v - 1; bk[i + 1][j] = (i, j, "skip")
            if j < M and v - 2 > dp[i][j + 1]: dp[i][j + 1] = v - 2; bk[i][j + 1] = (i, j, "unseen")
            if i < N and j < M:
                c = 1 if rows[i][1] == T[j] else -1
                if v + c > dp[i + 1][j + 1]: dp[i + 1][j + 1] = v + c; bk[i + 1][j + 1] = (i, j, "match")
    i, j, path = N, M, []
    while (i, j) != (0, 0):
        pi, pj, k = bk[i][j]; path.append((pi, pj, k)); i, j = pi, pj
    path.reverse()
    pairs = [(rows[pi], T[pj]) for pi, pj, k in path if k == "match"]
    how = "dynamic programming on V1 agreement (flatters V1; %d candidates, %d written)" % (N, M)
print("alignment:", how)
print("cand   time    V1     V2     written")
a1 = a2 = 0
for r, t in pairs:
    a1 += r[1] == t; a2 += r[2] == t
    flag = "" if (r[1] == t and r[2] == t) else ("  <- V1 wrong" if r[1] != t and r[2] == t else "  <- V2 wrong" if r[2] != t and r[1] == t else "  <- both wrong")
    print("%3d  %6.1fs  %-5s  %-5s  %-5s%s" % (r[0], r[3], r[1], r[2], t, flag))
n = len(pairs)
print("\nV1 agrees on %d of %d (%.0f%%); V2 agrees on %d of %d (%.0f%%)" % (a1, n, 100 * a1 / n, a2, n, 100 * a2 / n))
for name, k in (("V1", 1), ("V2", 2)):
    c = [p[0][k] for p in pairs]
    print("%s totals: %d makes, %d misses (written: %d makes, %d misses)" % (name, c.count("make"), c.count("miss"), T.count("make"), T.count("miss")))
