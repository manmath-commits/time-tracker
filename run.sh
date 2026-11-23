#!/bin/sh
# Run the tracker feasibility test (macOS / Linux)
cd "$(dirname "$0")" || exit 1
if ! command -v node >/dev/null 2>&1; then
  echo "Node.js is not installed. Install it from https://nodejs.org (LTS), then run this again."
  exit 1
fi
[ -d node_modules ] || npm install || exit 1
npm start
