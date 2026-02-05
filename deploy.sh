#!/bin/bash
set -euo pipefail

ROOT="$(cd "$(dirname "$0")" && pwd)"
OUT="$ROOT/public"

rm -rf "$OUT"
mkdir -p "$OUT"

# Copy everything except admin.html and dev-only folders
rsync -av \
  --exclude 'admin.html' \
  --exclude 'archive_screenshots' \
  --exclude 'public' \
  "$ROOT/" "$OUT/" > /dev/null

echo "Deployable site written to $OUT (admin.html excluded)."
