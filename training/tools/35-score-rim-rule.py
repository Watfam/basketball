"""Scores a simple rim-zone make/miss rule against hand-read outcomes.
Rule: a ball detected in the zone around the rim, then later detected BELOW the rim (under the net, close in x),
within a time window, is a make; otherwise a miss.   python3 35-score-rim-rule.py <dets.json> <outcomes.json> [below px] [window frames]"""
import json, sys
dets=json.load(open(sys.argv[1]))["detections"]; lab=json.load(open(sys.argv[2]))
BELOW=int(sys.argv[3]) if len(sys.argv)>3 else 30; WIN=int(sys.argv[4]) if len(sys.argv)>4 else 40
rx,ry=lab["rimInWindow"]
cx=lambda d:(d["x1"]+d["x2"])/2; cy=lambda d:(d["y1"]+d["y2"])/2
byf={}
for d in dets: byf.setdefault(d["f"],[]).append(d)
ok=bad=0; rows=[]
for s in lab["shots"]:
    if s["label"]=="none": continue
    f0,f1=s["startFrame"],s["endFrame"]
    inzone=[d for f in range(f0-6,f1+1) for d in byf.get(f,[]) if abs(cx(d)-rx)<=55 and ry-50<=cy(d)<=ry+45]
    first=min((d["f"] for d in inzone),default=None)
    below=[d for f in range((first or f0),(first or f0)+WIN) for d in byf.get(f,[]) if abs(cx(d)-rx)<=45 and cy(d)>=ry+BELOW and (d["x2"]-d["x1"])>=18]
    pred="make" if below else "miss"
    hit=pred==s["label"]; ok+=hit; bad+=not hit
    rows.append((s["n"],s["label"],s["confidence"],pred,"ok" if hit else "WRONG",len(inzone),len(below)))
for r in rows: print("shot %2d  read: %-4s (%-6s)  rule: %-4s %-5s  zone detections %2d, below-net detections %2d"%r)
print("\nagree with my reading: %d of %d (%.0f%%)"%(ok,ok+bad,100*ok/max(1,ok+bad)))
hi=[r for r in rows if r[2]=="high"]; print("on the 10 high-confidence makes: rule agrees on %d of %d"%(sum(1 for r in hi if r[4]=="ok"),len(hi)))
