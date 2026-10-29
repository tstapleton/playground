#!/usr/bin/env bash
# What a CI job would do on a pull request: build the feature's call graph on both sides
# and diff them. Here the two "checkouts" are fixtures/base and fixtures/pr.
set -euo pipefail
cd "$(dirname "$0")/.."

out="${1:-examples/callgraph-diff}"

node packages/store-callgraph/bin/store-callgraph.mjs diff \
  --feature src/app/features/dynamic-form \
  --base-dir fixtures/base \
  --head-dir fixtures/pr \
  --out "$out" \
  --base-label "main (fixtures/base)" \
  --head-label "feature/vat-check (fixtures/pr)"

# Keep the readable outputs; the JSON is regenerated on every run.
rm -f "$out"/base.json "$out"/head.json "$out"/diff.json
