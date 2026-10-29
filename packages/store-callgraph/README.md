# store-callgraph

Static call graphs of one feature of an Angular app built on NgRx SignalStore, diffed
between a pull request and its base, so reviewers see how the calls between stores,
components and services changed, not just the lines.

It's the static counterpart of [plotline](https://github.com/tstapleton/plotline), which
records sequence diagrams from integration tests. plotline shows what one test run did;
this shows every call the code can make, whether or not a test reaches it. The diffs
look and read the same way.

The graph is built from the source alone, with the TypeScript type checker and Angular's
template parser. It doesn't run the app or the tests, needs no changes to the app, and
gives byte-identical output for identical input.

See [`examples/callgraph-diff`](../../examples/callgraph-diff) for the output of
`npm run demo:callgraph`: the [PR comment](../../examples/callgraph-diff/comment.md) and
the [HTML report](../../examples/callgraph-diff/index.html).

## Use it locally

```bash
npx store-callgraph graph --feature src/app/features/meal-plan [--rev main | --dir path/to/app] --out callgraph
npx store-callgraph diff --feature src/app/features/meal-plan --base origin/main [--head HEAD] --out callgraph-diff \
  [--base-label main] [--head-label my-branch] [--report-url <link to index.html>]
```

`graph` writes `graph.json`, `diagrams.md` (Mermaid) and `index.html`: one diagram per
store method.

`diff` writes:

- **`comment.md`**: for a pull-request comment. Diagrams with more than 25 nodes are left
  to the report, and whole sections are left out if the comment would pass GitHub's size
  limit.
- **`index.html`**: a self-contained report rendered with [Pele](https://pele.run), with
  each store method before and after side by side. It has no scripts.
- `base.json`, `head.json` and `diff.json`: the graphs and the diff, for other tools.

The first thing it prints is the number of changes, for scripts that read it.

| Option | Meaning |
|---|---|
| `--feature <dir>` | The feature directory, relative to the tsconfig's directory. Required |
| `--tsconfig <path>` | The app's tsconfig, relative to the checkout (default `tsconfig.app.json`) |
| `--base <rev>`, `--head <rev>` | Git revisions, each checked out in a temporary worktree. Without `--head`, the head is the working tree |
| `--base-dir`, `--head-dir`, `--dir` | Directories to read as they are, instead of revisions |
| `--install <command>` | Run in a checked-out revision whose lockfile differs from the working tree's. By default the working tree's `node_modules` is reused |
| `--entry <pattern>` | `graph`: only store methods whose name matches, e.g. `'MealPlanStore.make*'` |
| `--depth <n>` | Calls to follow below a store method (`graph`, default 3) or below a change (`diff`, default 1) |
| `--up <n>` | Callers to show above a store method (default 1) |
| `--budget <n>` | Most nodes per diagram (default 40) |
| `--inline-limit <n>` | `diff`: diagrams with more nodes stay out of `comment.md` (default 25) |
| `--hide <a,b>` | Prefixes of outside code to leave out (default `@angular/,@ngrx/,rxjs,tslib,zone.js`) |

Any option can also be set in `store-callgraph.config.json` in the current directory, with
the option names as keys: `{ "feature": "src/app/features/meal-plan", "budget": 30 }`.

The same steps are available from code: `graphOf`, `diffGraphs`, `summarize`,
`diffComment`, `diffPage`, `graphDiagrams` and `serialize`.

## Reading a diff

The comment starts with **What changed**: each change in words, such as
"**MealPlanStore** `makeGroceryList()` now calls **GroceryApi** `lists()`". Calls rank
above state changes, and those above edits that changed neither. A change shown in
several diagrams is listed once, with how many.

A table follows with one row per diagram, then the store methods that didn't change. Each
diagram is a store method and the paths from it to what changed, with one level of calls
below each change and the method's direct callers, such as a template's event binding.
Changes no store method reaches, such as a computed or a template, get diagrams of their
own. Diagrams are in review order: biggest change first. A store method that is new or
gone is drawn as a plain graph rather than all + or all −.

| Mark | Meaning |
|---|---|
| `+` | added: a function or call only on the PR side |
| `−` | removed: only on the base side |
| `Δ` | changed: the function's code changed. The diagram notes what: `was load` (renamed), `was (id: string) => …` (signature), `+ updates error` (state), or `body only` (the code changed, but not what it calls or the state it uses) |
| `↕` | moved: the same call, at a different point, e.g. from inside `tap` into `catchError`, or into an `if` |

Code outside the feature is labelled `(new)` when the PR starts calling it and
`(removed)` when it stops. Solid arrows are calls, dotted arrows are reads (a computed,
or a method called from a template binding), and thick arrows are a child component's
`output.emit()` reaching the parent template. `⋯ 2 more calls` marks calls left out to
keep the diagram small.

## How it works

1. **Program.** The tsconfig is loaded with the TypeScript compiler API. The whole app is
   type-checked so that calls resolve, but nodes are only built for the feature directory.
2. **Nodes.** Each function in the feature becomes a node:
   - every property of the object a `withMethods` factory returns (store methods, including
     `rxMethod`s), and the functions the factory declares before returning;
   - `withComputed` properties, and `withHooks` `onInit` / `onDestroy`;
   - class methods, and class fields that hold a function, `computed()` or `effect()`;
   - top-level functions;
   - for each component with an inline `template`, one node per event (`(blurred)` on
     `<app-field>`) and one for everything else the template reads.

   IDs are a path relative to the feature directory plus a qualified name, such as
   `dynamic-form.store.ts#DynamicFormStore.load`, and never include line numbers.
3. **Edges.** Each call is resolved with the type checker. That works through SignalStore's
   generic types: `this.store.load()` in a component resolves to `load` in `withMethods`.
   Template expressions are parsed with `@angular/compiler` and resolved against the
   component's type. `output.emit()` is connected to the parent templates that bind that
   output, matched with Angular's own selector matcher. Reads of store state and
   `patchState` writes are recorded on the node rather than as edges.
4. **The feature boundary.** Anything outside the feature directory is a **boundary** node:
   a leaf whose body is never read. It's named after how the feature reaches it. A call
   through `inject(SOME_TOKEN)` is named after the token (`CLOCK.now`), and a call to an
   abstract class is marked as such. Angular, NgRx, RxJS and built-in calls are left out.
   Changes inside code outside the feature never show up. Only its signature and which
   feature code calls it are compared.
5. **Fingerprints.** Each node has a hash of its tokens, without comments or whitespace.
   Formatting changes don't alter it.
6. **Canonical output.** Nodes, edges and call sites are sorted and keys are in a fixed
   order. There are no timestamps or absolute paths. The analyzer's version and those of
   TypeScript and `@angular/compiler` are recorded in `inputs.analyzer`.

## Determinism

The same source, `node_modules` and analyzer version give byte-identical `graph.json`,
`comment.md` and `index.html`. The tests check this against golden files, across two runs,
and from a different working directory. To accept an intended change to the output, run
`UPDATE_GOLDEN=1 npm test`.

## Known limits

- **Inline templates only.** A component with `templateUrl` gets a warning and no template
  nodes.
- **Event handlers with the same tag and event share a node.** Two `<app-button (pressed)>`
  in one template become one node that calls both handlers. Numbering them by position would
  make IDs shift whenever an element is added above them.
- **Calls through a parameter** (a callback) become an `unresolved` leaf instead of a guess.
- **Custom `signalStoreFeature`s** aren't recognized as store members yet. Calls to them
  still resolve, but their methods aren't nodes.
- **Host listeners** (`host: { '(click)': … }`, `@HostListener`) aren't connected yet.
- **Reactivity isn't a call.** A computed recalculating because state changed is shown only
  as reads and writes on the nodes involved.
- **`node_modules` comes from the working tree** when a checked-out revision has the same
  lockfile. If the lockfile differs, pass `--install "npm ci --ignore-scripts"`, or the
  graph may resolve against the wrong library versions.
- **Dependencies must be installed.** Without `@ngrx/signals`' types nothing resolves, so the
  run fails rather than reporting that nothing changed.
- The analyzer uses the TypeScript 5.x compiler API that Angular 20 requires. TypeScript 7
  has a different API.

## Develop

```bash
npm ci
npm test            # unit tests, the edge-case project and the fixtures' golden files
npm run typecheck
npm run lint        # Biome
npm run build       # dist/: the CLI and the API, ESM
npm run verify      # all of the above, and npm pack --dry-run
```

| Path | What |
|---|---|
| `src/extract` | Program setup, finding functions, resolving calls, templates |
| `src/graph` | The graph model, canonical form, slicing into diagrams |
| `src/diff` | Pairing nodes (including renames), classifying changes, describing them, sections |
| `src/render` | Mermaid, the PR comment, the HTML report |
| `src/checkout` | Git worktrees and `node_modules` reuse |
| `test` | Unit tests, a small project covering edge cases, golden files for the fixtures |
