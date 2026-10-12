"""Impact sound around the rim, for every shot V4 called a make (design-time exploration; stdlib only).
  python3 46-audio.py <pairs dir>
A rim or board hit is a short, sharp, high-frequency impact; a swish is nearly silent. Band: above ~3 kHz (speech has little there).
Per shot, in the window from 0.15 s before to 0.45 s after the ball's first sighting in the rim zone (the ball falls to the ground
later than that, so its bounce on the concrete falls outside):
  peak     loudest 5 ms in the window, as a multiple of the clip's typical (median) level in that band
  sharp    that peak divided by the window's average level (how impulsive it is)
"""
import json, os, subprocess, sys, math, array, statistics as st
d = sys.argv[1]; FS = 16000; HOP = 80   # 5 ms
VIDEO = {"4839": "IMG_4839.MOV", "4840": "IMG_4840.MOV", "4844": "IMG_4844.MOV", "4851": "IMG_4851.MOV", "4866": "IMG_4866.MOV", "4867": "IMG_4867.MOV", "4872": "IMG_4872.MOV", "4874": "IMG_4874.MOV"}
rows = []
for clip, vid in VIDEO.items():
    pairs = [p for p in json.load(open(os.path.join(d, f"a-{clip}.json"))) if p['v4'] == 'make']
    raw = subprocess.run(["ffmpeg", "-nostdin", "-loglevel", "error", "-i", f"Training Video/{vid}", "-vn", "-ac", "1", "-ar", str(FS), "-f", "s16le", "-"], capture_output=True).stdout
    x = array.array('h'); x.frombytes(raw[:len(raw) // 2 * 2])
    a = math.exp(-2 * math.pi * 3000 / FS); y = []; px = py = 0.0   # one-pole high-pass at 3 kHz
    for v in x:
        py = a * (py + v - px); px = v; y.append(py)
    env = [math.sqrt(sum(s * s for s in y[i:i + HOP]) / HOP) for i in range(0, len(y) - HOP, HOP)]
    base = st.median(env) or 1.0
    print(clip, "audio seconds", round(len(x) / FS), "median band level", round(base, 1))
    for p in pairs:
        t = p['first'] * 1001 / 30000
        i0 = max(0, int((t - 0.15) / 0.005)); i1 = min(len(env), int((t + 0.45) / 0.005))
        w = env[i0:i1]
        if not w: rows.append(dict(clip=clip, n=p['n'], truth=p['truth'], peak=None, sharp=None)); continue
        pk = max(w); rows.append(dict(clip=clip, n=p['n'], truth=p['truth'], peak=round(pk / base, 2), sharp=round(pk / (sum(w) / len(w)), 2)))
json.dump(rows, open(os.path.join(d, 'audio.json'), 'w'))
for truth in ('make', 'miss'):
    r = [x for x in rows if x['truth'] == truth]
    for k in ('peak', 'sharp'):
        v = sorted(x[k] for x in r if x.get(k) is not None)
        print(f"{truth:4s} n={len(r):3d} {k:5s} median {st.median(v):6.2f}  p25 {v[len(v)//4]:6.2f}  p75 {v[3*len(v)//4]:6.2f}  max {v[-1]:6.2f}")
