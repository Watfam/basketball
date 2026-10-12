"""Rim-contact evidence from ONE followed ball, for every shot V4 called a make (design-time exploration; no clip here is a fresh test).
  python3 45-kink.py <pairs dir>      pairs = per-shot files written by tools/41 with PAIRS_OUT (a-<clip>.json)
The ball is followed from its first sighting in the rim zone, forward and backward (nearest detection, <= 30 px per frame, gaps <= 8 frames).
A ball that hits the rim changes velocity abruptly; one that falls through the net is slowed smoothly. Features, hoop-window px and frames:
  kink    biggest change of velocity between two consecutive path steps, near the rim (|x| <= 60, from 40 above to 50 below)
  up      fastest UPWARD speed after the ball has reached the rim line (a bounce off the rim or board)
  side    biggest sideways speed near the rim
  n       path points near the rim (how much evidence there is)
"""
import json, sys, os, math
d = sys.argv[1]
def track(dets_by_f, start, rim, direction, lim=8, jump=30):
    path = [start]
    f = start['f']
    while True:
        f += direction
        if abs(f - start['f']) > 70: break
        last = path[-1]
        if abs(f - last['f']) > lim: break
        c = [q for q in dets_by_f.get(f, []) if math.hypot(q['cx'] - last['cx'], q['cy'] - last['cy']) < jump * abs(f - last['f'])]
        if c:
            q = min(c, key=lambda q: math.hypot(q['cx'] - last['cx'], q['cy'] - last['cy'])); path.append(q)
    return path
rows = []
for fn in sorted(os.listdir(d)):
    if not (fn.startswith('a-') and fn.endswith('.json')): continue
    clip = fn[2:-5]
    pairs = json.load(open(os.path.join(d, fn))); cache = {}
    for p in pairs:
        if p['v4'] != 'make': continue
        if p['dets'] not in cache:
            by = {}
            for q in json.load(open(p['dets']))['detections']:
                q = dict(q); q['cx'] = (q['x1'] + q['x2']) / 2; q['cy'] = (q['y1'] + q['y2']) / 2; by.setdefault(q['f'], []).append(q)
            cache[p['dets']] = by
        by = cache[p['dets']]; rx, ry = p['rimWin']['x'], p['rimWin']['y']; first = p['first']
        at = by.get(first, [])
        if not at: rows.append(dict(clip=clip, n=p['n'], truth=p['truth'], kink=None)); continue
        s = min(at, key=lambda q: math.hypot(q['cx'] - rx, q['cy'] - ry))
        path = sorted(track(by, s, (rx, ry), -1)[1:] + [s] + track(by, s, (rx, ry), +1)[1:], key=lambda q: q['f'])
        vs = []
        for a, b in zip(path, path[1:]):
            dt = b['f'] - a['f']
            if dt <= 0: continue
            vs.append(((a['f'] + b['f']) / 2, (b['cx'] - a['cx']) / dt, (b['cy'] - a['cy']) / dt, (a['cx'] + b['cx']) / 2 - rx, (a['cy'] + b['cy']) / 2 - ry))
        near = [v for v in vs if abs(v[3]) <= 60 and -40 <= v[4] <= 50]
        kink = up = side = None
        if len(near) >= 1: side = max(abs(v[1]) for v in near)
        ks = [math.hypot(b[1] - a[1], b[2] - a[2]) / max(1, (b[0] - a[0])) for a, b in zip(vs, vs[1:]) if abs(a[3]) <= 60 and -40 <= a[4] <= 50]
        if ks: kink = max(ks)
        after = [v for v in vs if v[4] >= -15]
        if after: up = max(0, -min(v[2] for v in after))
        rows.append(dict(clip=clip, n=p['n'], truth=p['truth'], kink=None if kink is None else round(kink, 2), up=None if up is None else round(up, 1), side=None if side is None else round(side, 1), pts=len(near)))
json.dump(rows, open(os.path.join(d, 'kink.json'), 'w'))
import statistics as st
for truth in ('make', 'miss'):
    r = [x for x in rows if x['truth'] == truth]
    for k in ('kink', 'up', 'side'):
        v = sorted(x[k] for x in r if x.get(k) is not None)
        print(f"{truth:4s} n={len(r):3d}  {k:5s} known {len(v):3d}  median {st.median(v):6.2f}  p25 {v[len(v)//4]:6.2f}  p75 {v[3*len(v)//4]:6.2f}  max {v[-1]:6.2f}")
