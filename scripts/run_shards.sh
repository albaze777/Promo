#!/bin/bash
# usage: run_shards.sh <dir> <out> <n> <extra render args...>
cd "$(dirname "$0")/.."
DIR=$1; OUT=$2; N=$3; shift 3
mkdir -p "$DIR" out/logs
pids=()
for ((i=0;i<N;i++)); do
  bun scripts/render.ts segments --to 95.625 --shard $i/$N --jobs 1 --dir $DIR --out $OUT "$@" > out/logs/shard_$i.log 2>&1 &
  pids+=($!)
  sleep 30
done
for p in "${pids[@]}"; do wait $p; done
bun scripts/render.ts segments --to 95.625 --jobs 1 --dir $DIR --out $OUT "$@" > out/logs/concat.log 2>&1
echo DONE >> out/logs/concat.log
