#!/usr/bin/env bash
# Lighthouse lab runs (Phase 8). Public pages can be measured on any URL;
# signed-in pages need a session cookie from a server running the synthetic
# benchmark dataset (see playwright.perf.config.ts), never real data.
#
#   CHROME_PATH=/path/to/chrome perf/lighthouse.sh OUT_DIR BASE_URL [COOKIE]
#
# Runs each page 3 times with Lighthouse's default mobile profile and once
# with the desktop preset; writes the JSON reports and prints a summary.
set -euo pipefail
OUT=${1:?output dir}; BASE=${2:?base url}; COOKIE=${3:-}
mkdir -p "$OUT"
LH="npx -y lighthouse@12.8.2"
FLAGS=(--quiet --only-categories=performance,accessibility --output=json
       "--chrome-flags=--headless=new --use-fake-ui-for-media-stream --use-fake-device-for-media-stream --ignore-certificate-errors")
PAGES=("welcome:/welcome")
if [ -n "$COOKIE" ]; then
  HDR="{\"Cookie\":\"$COOKIE\"}"
  FLAGS+=("--extra-headers=$HDR")
  PAGES+=("patient-home:/" "patient-family:/family" "patient-memories:/memories" "caregiver-overview:/caregiver" "caregiver-visits:/caregiver/visits")
fi
for entry in "${PAGES[@]}"; do
  name=${entry%%:*}; path=${entry#*:}
  for run in 1 2 3; do
    $LH "$BASE$path" "${FLAGS[@]}" --output-path="$OUT/$name-mobile-$run.json" || echo "lighthouse failed: $name mobile $run"
  done
  $LH "$BASE$path" "${FLAGS[@]}" --preset=desktop --output-path="$OUT/$name-desktop-1.json" || echo "lighthouse failed: $name desktop"
done
node -e '
const fs = require("fs"), dir = process.argv[1];
const rows = {};
for (const f of fs.readdirSync(dir).filter((f) => f.endsWith(".json"))) {
  const r = JSON.parse(fs.readFileSync(`${dir}/${f}`, "utf8"));
  const key = f.replace(/-\d+\.json$/, "");
  const a = r.audits;
  (rows[key] ??= []).push({ perf: r.categories.performance.score * 100, a11y: r.categories.accessibility.score * 100,
    lcp: a["largest-contentful-paint"].numericValue, fcp: a["first-contentful-paint"].numericValue,
    tbt: a["total-blocking-time"].numericValue, cls: a["cumulative-layout-shift"].numericValue,
    bytes: a["total-byte-weight"].numericValue });
}
const med = (v) => v.sort((x, y) => x - y)[Math.floor((v.length - 1) / 2)];
const out = {};
for (const [k, runs] of Object.entries(rows)) {
  out[k] = Object.fromEntries(Object.keys(runs[0]).map((m) => [m, Math.round(med(runs.map((r) => r[m])) * 1000) / 1000]));
  out[k].runs = runs.length;
}
fs.writeFileSync(`${dir}/summary.json`, JSON.stringify(out, null, 1));
console.table(out);
' "$OUT"
