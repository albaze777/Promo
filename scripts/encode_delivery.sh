#!/bin/bash
set -e
# Two-pass delivery copies of the CRF 16 master: repo.mp4 (<100 MB for git) and share copies (<30 MiB).
cd "$(dirname "$0")/../out"
M=${1:-oredlab-promo_master.mp4}   # master to encode (path relative to out/)
enc() { # out vbitrate scale abitrate
  ffmpeg -loglevel error -y -i $M -vf "$3" -c:v libx264 -preset slow -b:v $2 -pass 1 -passlogfile pl_$1 -pix_fmt yuv420p -an -f mp4 /dev/null
  ffmpeg -loglevel error -y -i $M -vf "$3" -c:v libx264 -preset slow -b:v $2 -maxrate $(( ${2%k} * 3 / 2 ))k -bufsize $(( ${2%k} * 2 ))k -pass 2 -passlogfile pl_$1 -pix_fmt yuv420p \
    -colorspace bt709 -color_primaries bt709 -color_trc bt709 -c:a aac -b:a $4 -ar 48000 -movflags +faststart $1
}
enc repo.mp4 7800k "scale=1920:1080" 192k
enc share1080.mp4 2300k "scale=1920:1080" 128k
enc share720.mp4 2300k "scale=1280:720:flags=lanczos" 128k
echo ENC_DONE
