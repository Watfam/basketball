"""Scores the rim rule on a clip against the shooter's written list of results. No tuning happens here.

  python3 38-align-score.py <dets.json> <candidates.json> <rimX> <rimY> <truth.json> [skip-allowed]

dets.json        per-frame ball detections from 22-dump-detections.mjs (coordinates inside the 416 px hoop window)
candidates.json  moments with a ball in the rim zone, from 23-shot-candidates.mjs
rimX rimY        the rim's position inside that 416 px window
truth.json       {"results": ["make","miss", ...]} in the order the shots happened

The rule (fixed in advance, same as tools/35): a ball seen under the net soon after it was first seen in the rim zone is a
make, otherwise a miss. Candidates are matched to the written list in order by dynamic programming; a candidate may be
a non-shot (skipped), and a written shot may have no candidate (reported as unseen). The match is chosen to agree as
well as possible, which flatters the score a little, so the table is printed in full."""
import json, sys

dets = json.load(open(sys.argv[1]))["detections"]
cands = json.load(open(sys.argv[2]))
rx, ry = float(sys.argv[3]), float(sys.argv[4])
T = json.load(open(sys.argv[5]))["results"]
fps = 30000 / 1001

byf = {}
for d in dets:
    byf.setdefault(d["f"], []).append(d)
cx = lambda d: (d["x1"] + d["x2"]) / 2
cy = lambda d: (d["y1"] + d["y2"]) / 2


def rule(c):
    f0, f1 = c["start"], c["end"]
    inz = [d for f in range(f0 - 6, f1 + 1) for d in byf.get(f, []) if abs(cx(d) - rx) <= 55 and ry - 50 <= cy(d) <= ry + 45]
    first = min((d["f"] for d in inz), default=f0)
    below = [d for f in range(first, first + 40) for d in byf.get(f, []) if abs(cx(d) - rx) <= 45 and cy(d) >= ry + 30 and (d["x2"] - d["x1"]) >= 18]
    return "make" if below else "miss"


C = [(i + 1, rule(c), round(c["start"] / fps, 1)) for i, c in enumerate(cands)]
N, M, NEG = len(C), len(T), -1e9
dp = [[NEG] * (M + 1) for _ in range(N + 1)]
bk = [[None] * (M + 1) for _ in range(N + 1)]
dp[0][0] = 0
for i in range(N + 1):
    for j in range(M + 1):
        v = dp[i][j]
        if v == NEG:
            continue
        if i < N and v - 1 > dp[i + 1][j]:
            dp[i + 1][j] = v - 1; bk[i + 1][j] = (i, j, "skip")
        if j < M and v - 2 > dp[i][j + 1]:
            dp[i][j + 1] = v - 2; bk[i][j + 1] = (i, j, "unseen")
        if i < N and j < M:
            c = 1 if C[i][1] == T[j] else -1
            if v + c > dp[i + 1][j + 1]:
                dp[i + 1][j + 1] = v + c; bk[i + 1][j + 1] = (i, j, "match")
i, j, path = N, M, []
while (i, j) != (0, 0):
    pi, pj, k = bk[i][j]; path.append((pi, pj, k)); i, j = pi, pj
path.reverse()
hit = bad = skipped = unseen = 0
print("cand   time   rule     written result")
for pi, pj, k in path:
    n, pred, t = C[pi] if pi < N else (None, None, None)
    if k == "match":
        ok = pred == T[pj]; hit += ok; bad += not ok
        print("%3d  %6.1fs  %-5s    #%2d %-5s   %s" % (n, t, pred, pj + 1, T[pj], "yes" if ok else "NO"))
    elif k == "skip":
        skipped += 1; print("%3d  %6.1fs  %-5s    (counted as not a shot)" % (n, t, pred))
    else:
        unseen += 1; print("                        #%2d %-5s   (no candidate: the detector never saw this shot)" % (pj + 1, T[pj]))
tot = hit + bad
print("\nwritten shots %d (%d makes, %d misses); candidates %d; not-a-shot %d; unseen %d" % (M, T.count("make"), T.count("miss"), N, skipped, unseen))
print("rule agrees on %d of %d matched shots (%.0f%%); counting unseen shots as wrong: %d of %d (%.0f%%)" % (hit, tot, 100 * hit / max(1, tot), hit, M, 100 * hit / M))
calls = [p for pi, pj, k in path if k == "match" for p in [C[pi][1]]]
print("rule's totals on matched shots: %d makes, %d misses (written: %d makes, %d misses)" % (calls.count("make"), calls.count("miss"), T.count("make"), T.count("miss")))
