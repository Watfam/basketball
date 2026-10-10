"""Per-shot evidence for every shot V2 called a make, from the exported pairs (tools/41 with PAIRS_OUT) and the detection files.
Design-time exploration only: every clip here has been looked at, so nothing printed is a test result.
  python3 42-features.py <pairs dir> [clip ...]
Features (hoop-window pixels after scaling to 416, rim at the window's rim point):
  above   sightings > 12 px above the rim line and within 40 px sideways, in the 45 frames before to 15 after the first zone sighting
  rise    biggest climb back up (px) by the ball after first reaching the rim line (a bounce off the rim)
  xcross  sideways distance from the rim centre where the ball's path crosses the rim line (None if not followed)
  wratio  median width of sightings within 15 px of the rim line / the clip's median width above the rim
  tbelow  frames from first zone sighting to first below-net sighting
"""
import json, sys, os, statistics as st
d = sys.argv[1]
clips = sys.argv[2:] or sorted(f[:-5] for f in os.listdir(d) if f.endswith('.json'))
rows = []
for clip in clips:
    pairs = json.load(open(os.path.join(d, clip + '.json')))
    cache = {}; refs = {}
    for p in pairs:
        if p['v2'] != 'make': continue
        dets = cache.setdefault(p['dets'], json.load(open(p['dets']))['detections'])
        rx, ry = p['rimWin']['x'], p['rimWin']['y']
        first = p['first']
        cxy = lambda q: ((q['x1'] + q['x2']) / 2, (q['y1'] + q['y2']) / 2)
        win = [q for q in dets if first - 45 <= q['f'] <= first + 75]
        # clip-wide reference width: balls above the rim, near its line
        if (clip, p['dets']) not in refs:
            refs[(clip, p['dets'])] = st.median([q['x2'] - q['x1'] for q in dets if abs(cxy(q)[0] - rx) < 60 and ry - 120 < cxy(q)[1] < ry - 20])
        ref = refs[(clip, p['dets'])]
        above = [q for q in win if first - 45 <= q['f'] <= first + 15 and cxy(q)[1] < ry - 12 and abs(cxy(q)[0] - rx) <= 40]
        # follow one ball from its first zone sighting
        zone = [q for q in win if q['f'] >= first and abs(cxy(q)[0] - rx) <= 55 and ry - 50 <= cxy(q)[1] <= ry + 45]
        rise = 0.0; reached = None
        for q in sorted(win, key=lambda q: q['f']):
            if q['f'] < first: continue
            x, y = cxy(q)
            if abs(x - rx) > 60: continue
            if reached is None and y >= ry - 5: reached = y; low = y; continue
            if reached is not None:
                low = max(low, y); rise = max(rise, low - y)
        near = [q['x2'] - q['x1'] for q in win if first - 5 <= q['f'] <= first + 25 and abs(cxy(q)[1] - ry) <= 15 and abs(cxy(q)[0] - rx) <= 40]
        # path crossing: consecutive sightings (gap <= 6 frames) straddling the rim line, going down
        ss = sorted([q for q in win if abs(cxy(q)[0] - rx) <= 80], key=lambda q: q['f'])
        xc = None
        for a, b in zip(ss, ss[1:]):
            (xa, ya), (xb, yb) = cxy(a), cxy(b)
            if b['f'] - a['f'] <= 6 and ya < ry <= yb and yb > ya:
                xc = xa + (xb - xa) * (ry - ya) / (yb - ya) - rx; break
        rows.append(dict(clip=clip, n=p['n'], t=round(p['firstMs'] / 1000, 1), truth=p['truth'], above=len(above), rise=round(rise),
                         xcross=None if xc is None else round(xc), wratio=round(st.median(near) / ref, 2) if near else None,
                         fall=p['fall'] and round(p['fall'], 1), dx=p['belowMinDx'] and round(p['belowMinDx']), zs=p['zoneSightings'], flag='F' if p['flagged'] else ''))
rows.sort(key=lambda r: (r['truth'] != 'miss', r['clip'], r['n']))
print('clip   n     t   truth  above rise xcross wratio  fall  dx  zs flag')
for r in rows:
    print('%s %3d %6.1f  %-5s  %4d %4d %6s %6s %5s %3s %3d  %s' % (r['clip'], r['n'], r['t'], r['truth'], r['above'], r['rise'], r['xcross'], r['wratio'], r['fall'], r['dx'], r['zs'], r['flag']))
json.dump(rows, open(os.path.join(d, 'features.json'), 'w'))
