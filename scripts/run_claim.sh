#!/bin/bash
# usage: run_claim.sh <dir> <out> <n> <render args...>: n processes sharing one chunk queue, then concat
cd "$(dirname "$0")/.."
DIR=$1; OUT=$2; N=$3; shift 3
mkdir -p "$DIR" out/logs
rm -rf $DIR/*.lock $DIR/*.part.mp4
pids=()
for ((i=0;i<N;i++)); do
  bun scripts/render.ts segments --to 95.625 --claim --jobs 1 --dir $DIR --out $OUT "$@" > out/logs/claim_$i.log 2>&1 &
  pids+=($!)
  sleep 30
done
for p in "${pids[@]}"; do wait $p; done
rm -rf $DIR/*.lock
bun scripts/render.ts segments --to 95.625 --jobs 1 --dir $DIR --out $OUT "$@" > out/logs/concat.log 2>&1
echo DONE >> out/logs/concat.log
