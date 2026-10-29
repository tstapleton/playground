# store-callgraph

Static call graphs of one feature of an Angular app built on NgRx SignalStore, and diffs of
those graphs between two revisions. It's meant for pull-request review: it shows what a
change does to the calls between stores, components and services, beyond what the line
diff shows.

The graph is built from the source alone, with the TypeScript type checker and Angular's
template parser. It doesn't run the app or the tests, needs no changes to the app, and
gives byte-identical output for identical input.

See [`examples/callgraph-diff`](../../examples/callgraph-diff) for the output of
`npm run demo:callgraph`: the [PR comment](../../examples/callgraph-diff/comment.md) and
the [HTML report](../../examples/callgraph-diff/index.html).

## Commands

```bash
# The call graph of one revision: one diagram per store method.
store-callgraph graph --feature src/app/features/dynamic-form [--rev main | --dir path/to/app] --out callgraph

# What a pull request changes.
store-callgraph diff --feature src/app/features/dynamic-form --base origin/main [--head HEAD] --out callgraph-diff \
  [--base-label main] [--head-label my-branch] [--report-url <link to index.html>]
```

`graph` writes `graph.json`, `diagrams.md` (Mermaid) and `index.html`.

`diff` writes:

- **`comment.md`**: for a pull-request comment. It has a summary line and a table of every
  change, followed by one Mermaid diagram per changed store method. Diagrams with more than
  25 nodes are replaced by a link to the report, and the largest diagrams are dropped if the
  comment would exceed GitHub's size limit.
- **`index.html`**: a self-contained report with the same table and every diagram, rendered
  to SVG with [Pele](https://pele.run). It has no scripts.
- `base.json`, `head.json` and `diff.json`: the graphs and the diff, for other tools.

| Option | Meaning |
|---|---|
| `--feature <dir>` | The feature directory, relative to the tsconfig's directory. Required |
| `--tsconfig <path>` | The app's tsconfig, relative to the checkout (default `tsconfig.app.json`) |
| `--base <rev>`, `--head <rev>` | Git revisions. Each is checked out in a temporary worktree. Without `--head`, the head is the working tree |
| `--base-dir`, `--head-dir`, `--dir` | Directories to read as they are, instead of revisions |
| `--install <command>` | Run in a checked-out revision whose lockfile differs from the working tree's. By default the working tree's `node_modules` is reused |
| `--entry <pattern>` | `graph`: only store methods whose name matches, e.g. `'DynamicFormStore.load*'` |
| `--depth <n>` | Calls to follow below an entry point (`graph`, default 3) or below a change (`diff`, default 1) |
| `--up <n>` | Callers to show above an entry point (default 1) |
| `--budget <n>` | Most nodes per diagram (default 40) |
| `--inline-limit <n>` | `diff`: diagrams with more nodes stay out of `comment.md` (default 25) |
| `--hide <a,b>` | Prefixes of boundary IDs to leave out (default `@angular/,@ngrx/,rxjs,tslib,zone.js`) |

Any option can also be set in `store-callgraph.config.json` in the current directory, with
the option names as keys: `{ "feature": "src/app/features/dynamic-form", "budget": 30 }`.

The same steps are available from code: `graphOf`, `diffGraphs`, `diffDiagrams`,
`graphDiagrams`, `diffComment`, `diffPage` and `serialize`, all from `store-callgraph`.

## Reading a diff

Every function in the feature is compared with its counterpart on the other side, and gets
one of these classes, most significant first:

| Class | Meaning | Drawn as |
|---|---|---|
| calls changed | It calls something new or stops calling something, or its signature changed | Amber |
| added / removed | It exists on one side only | Green / red, dashed |
| call context changed | Same calls, but one runs somewhere else: inside a different RxJS operator or callback, under different control flow, or with different operators piped onto it | Amber, dashed |
| state access changed | Same calls, but it writes (`patchState`) or reads different store state | Blue |
| body changed | Only the body changed; calls, context and state access are the same | Thick outline |
| renamed | Same body or mostly the same callees under a new name | Blue, dotted |

Edges are green when added, red and dashed when removed, and amber and dotted when their
context changed. A context change is labelled with where the call was and where it is now:
`was switchMap, piped tap › catchError, now switchMap › defer, piped retry › tap › catchError`.

Solid arrows are calls, dotted arrows are reads (a computed signal, or a method called from
a template binding), and thick arrows are a child component's `output.emit()` reaching the
parent template's handler.

There is one diagram per store method that changed or reaches a change. It shows the paths
from the method to the changes, one level of calls below each change, and the method's
direct callers, such as a template event binding or `ngOnInit`. Changes that no store
method reaches, such as a computed or a template, are drawn in further diagrams.

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
- The analyzer uses the TypeScript 5.x compiler API that Angular 20 requires. TypeScript 7
  has a different API.

## Layout

| Path | What |
|---|---|
| `src/extract` | Program setup, unit discovery, call resolution, templates |
| `src/graph` | The graph model, canonical form, slicing into diagrams |
| `src/diff` | Pairing nodes (including renames) and classifying changes |
| `src/render` | Mermaid, PR comment, HTML report |
| `src/checkout` | Git worktrees and `node_modules` reuse |
| `test` | Unit tests, a small project covering edge cases, golden files for the fixtures |
