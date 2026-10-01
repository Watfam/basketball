#!/bin/bash
# usage: strips.sh <index> <time_seconds>
S=/Users/WatfordFamily/Desktop/basketball-app/training/work
idx=$1; t=$2
start=$(echo "$t - 0.7" | bc -l)
if (( $(echo "$start < 0" | bc -l) )); then start=0; fi
ffmpeg -nostdin -loglevel error -y -ss "$start" -i "/Users/WatfordFamily/Desktop/basketball-app/Training Video/IMG_4824.MOV" -t 2.2 -an \
  -vf "fps=5,crop=260:260:845:330,scale=224:224,drawtext=text='%{pts\:hms}':x=4:y=4:fontsize=14:fontcolor=white:box=1:boxcolor=black@0.5,tile=11x1" -frames:v 1 "$S/strips/c$(printf %02d $idx).jpg"
