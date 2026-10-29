# store-callgraph

Builds static call graphs of one feature of an Angular + NgRx SignalStore app from its
source, and diffs them between a pull request and its base. The sibling of
[plotline](https://github.com/tstapleton/plotline), which records sequence diagrams from
tests; the PR comment and HTML report follow plotline's patterns (marks `+ − Δ ↕`,
translucent fills, "What changed" in words, review order, collapsed unchanged parts), so
keep the two in step. See `README.md` for how it's used and how analysis works.

## Layout

| Path | What's there |
|---|---|
| `src/extract` | TypeScript program, finding functions (`units.ts`), resolving calls (`resolve.ts`), templates |
| `src/graph` | Graph model, canonical JSON, slicing into diagrams |
| `src/diff` | Pairing and classifying changes, describing them in words, review sections |
| `src/render` | Mermaid, the PR comment, the HTML report |
| `src/checkout` | Git worktrees for revisions, `node_modules` reuse |
| `src/cli.ts` | The `store-callgraph` CLI (`graph`, `diff`) |
| `test/` | Unit tests, `test/project` for edge cases, golden files for the fixtures |

## Commands

| Command | Purpose |
|---|---|
| `npm ci` | Install dependencies |
| `npm run build` | Bundle `src/` → `dist/` with tsup |
| `npm run typecheck` | `tsc --noEmit` |
| `npm test` | Unit and golden tests |
| `npm run lint` | Biome lint + format check |
| `npm run format` | Apply Biome formatting and safe fixes |
| `npm run verify` | Typecheck, lint, test, build and `npm pack --dry-run` |

## Always / Never

**Always:**
- Run `npm run verify` before asking for review.
- Keep output deterministic: sort by `compare` (code units, never `localeCompare`), no
  timestamps, no absolute paths, no line numbers in IDs.
- When output changes on purpose, regenerate the golden files with
  `UPDATE_GOLDEN=1 npm test` and check the diff of `test/golden/` reads right.

**Never:**
- Follow calls past the feature directory: code outside it is a leaf.
- Add a dependency without pinning an exact version (`.npmrc` sets `save-exact`).
- Add features, refactoring or cleanup beyond what the task needs.
