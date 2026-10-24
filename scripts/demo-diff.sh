#!/usr/bin/env bash
# What a CI job would do on a pull request: trace the base and the PR, then diff them.
# Here the two "checkouts" are fixtures/base and fixtures/pr.
set -euo pipefail
cd "$(dirname "$0")/.."

out="${1:-examples/trace-diff}"

for side in base pr; do
  rm -rf "fixtures/$side/traces"
  (cd "fixtures/$side" && TRACE=1 npx jest --silent)
done

npx signal-trace diff fixtures/base/traces fixtures/pr/traces \
  --out "$out" \
  --base-label "main (fixtures/base)" \
  --head-label "feature/vat-check (fixtures/pr)"
