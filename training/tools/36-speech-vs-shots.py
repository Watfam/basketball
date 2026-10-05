"""Lists, for each hand-read shot, the words a transcript (.vtt from whisper.cpp) contains shortly after the ball
reaches the rim zone.   python3 36-speech-vs-shots.py <transcript.vtt> <outcomes.json> [from s=0.3] [to s=4.0]"""
import re, json, sys
t=open(sys.argv[1]).read(); lab=json.load(open(sys.argv[2]))
A=float(sys.argv[3]) if len(sys.argv)>3 else 0.3; B=float(sys.argv[4]) if len(sys.argv)>4 else 4.0
segs=re.findall(r'(\d+):(\d+):(\d+)\.(\d+) --> (\d+):(\d+):(\d+)\.(\d+)\n\s*(.*)',t)
rows=[(int(a)*3600+int(b)*60+int(c)+int(d)/1000,int(e)*3600+int(f)*60+int(g)+int(h)/1000,x.strip()) for a,b,c,d,e,f,g,h,x in segs]
rows=[r for r in rows if r[2] and not set(r[2])<=set('♪ ')]
print(len(rows),"non-music segments")
for s in lab['shots']:
    t0=s['startFrame']/lab['fps']
    heard=[x[2] for x in rows if t0+A<=x[0]<=t0+B]
    print("shot %2d @%5.1fs  read: %-4s %-6s heard: %s"%(s['n'],t0,s['label'],s['confidence'],heard))
print("\nall segments:",[(round(a,1),w) for a,b,w in rows])
