# Proposal: static call graphs and call-graph diffs for SignalStore features

Status: proposal, nothing built yet.

## The problem

A code diff shows which lines changed. It doesn't show what those lines do to the feature:
that `markTouched` now validates the form and calls an external registry, or that a
notification moved from one error path to another. Reviewers have to work that out by
reading every changed method and following its callers and callees by hand.

The tool should answer that question with a diagram, starting from the NgRx SignalStore
methods (`withMethods`) that make up a feature's public API. The diagram has to be
reproducible: the same two revisions always produce the same output, with no LLM involved.

This repository already has [`signal-trace`](../packages/signal-trace), which records
**runtime** sequence diagrams from Jest integration tests and diffs them. This proposal
covers the other half: a **static** call graph of the code itself, whether or not a test
exercises it.

## Static analysis or runtime instrumentation

| | Static analysis (TypeScript checker + Angular template parser) | Runtime instrumentation (as in `signal-trace`) |
|---|---|---|
| Coverage | Every call written in the code, including error paths no test reaches | Only the paths the tests take |
| What it needs | Source and `node_modules` for the revision | A working test suite, instrumentation in each store (`withTracing`), and wrapped providers |
| Works on any revision | Yes. Checkout and type-check only | Only if that revision's tests run and pass |
| Determinism | Fully deterministic: the same source, lockfile and analyzer always give the same graph | Depends on async ordering, fake timers and test data; `signal-trace` handles this, but it is harder to guarantee |
| Precision | Over-approximates: it shows calls that *can* happen, including both branches of an `if` | Exact for what happened, with real arguments and state changes |
| Dynamic dispatch | Needs help for abstract classes, `InjectionToken`s and callbacks (see Limits) | Handled automatically |
| Speed | A few seconds per revision; Angular 20's TS 5.9 checker is the main cost | A full test run per revision |
| Answers | "What can this method reach, and how did that change?" | "What did this scenario do, and how did that change?" |

**Recommendation: build on static analysis.** It meets the requirements directly. It
covers any revision, is deterministic by construction, needs no changes to the app, and
shows structure rather than one scenario. Runtime traces stay useful and complementary.
An optional later phase can overlay `signal-trace` results onto the static graph, marking
which edges the tests exercised (see Phase 6). That overlay is the only place runtime
data would enter. The static graph is the source of truth.

## Tools considered

| Tool | Granularity | Angular awareness | Fit |
|---|---|---|---|
| **TypeScript compiler API** (`ts.createProgram` + type checker) | Call expression → declaration | None by itself, but it resolves through SignalStore's generic types (verified below) | **Core of the proposal** |
| **`@angular/compiler` `parseTemplate`** | Template event bindings → method calls | Full Angular template syntax (control flow, `@let`, outputs) | **Use for templates** (verified below) |
| ts-morph | Wrapper over the TS API | None | Convenience only. It adds a dependency without adding capability |
| tsserver call hierarchy (`provideCallHierarchyOutgoingCalls`) | Method-level | None (no templates) | Useful as a cross-check in tests. One query per position is slow, and it doesn't capture RxJS context |
| ngtsc type-check blocks / Angular Language Service | Precise template symbols | Full | Private APIs that change between Angular majors. Keep as a fallback if `parseTemplate` + checker resolution falls short |
| [Jelly](https://github.com/cs-au-dk/jelly) (Aarhus University) | Points-to call graph, good with higher-order functions | None (no DI, no templates) | Research-grade and approximate. DI-typed services make type-based resolution accurate enough for this use, so Jelly isn't needed |
| CodeQL | Full call graph, database per revision | Limited | Heavy, not an npm package, and licensed only for public repos or GitHub Advanced Security |
| scip-typescript / LSIF | References, not calls | None | Would need post-processing into call edges |
| dependency-cruiser, madge, Nx graph | Module or project level | None or partial | Too coarse |
| Compodoc, ngrev | Module, component and DI level | Yes | No method-level call edges |
| Angular DevTools, OpenTelemetry, V8 coverage | Runtime | Partial | Same limits as runtime instrumentation. V8 coverage could flag which static edges tests reached |

**TypeScript 7.** TypeScript 7.0, the native Go port, shipped in mid-2026. Its
programmatic API replaces the existing one, and Angular 20 requires TypeScript 5.8–5.9
anyway. The analyzer should use the project's own `typescript` (a peer dependency) and
keep every checker call behind one small `SymbolResolver` interface. A TS 7 backend can
then be added later without touching graph building, diffing or rendering.

## Feasibility spike (run against `fixtures/pr`)

Two throwaway scripts (not committed) checked the two assumptions everything rests on.

**1. The checker resolves calls through SignalStore's generics.** For every
property-access call, `checker.getSymbolAtLocation()` followed back to its non-`.d.ts`
declaration gave:

```
dynamic-form.component.ts:58  this.store.load      -> load @ dynamic-form.store.ts:105
dynamic-form.component.ts:74  this.store.submit    -> submit @ dynamic-form.store.ts:154
dynamic-form.store.ts:110     api.getDefinition    -> FormApiClient.getDefinition @ form-api.client.ts:58
dynamic-form.store.ts:114     analytics.track      -> Analytics.track @ analytics.ts:6
dynamic-form.store.ts:72      rules.validate       -> RulesEngine.validate @ rules-engine.ts:22
dynamic-form.store.ts:55      store.values         -> values @ dynamic-form.store.ts:17   (state signal read)
```

So a component's call to `store.load()` lands on the `load:` property inside
`withMethods`. Services injected through `withMethods((store, api = inject(FormApiClient)) => …)`
resolve to their class methods. State signals resolve to the state interface and can be
told apart from methods. Calls inside `rxMethod(pipe(tap(…), switchMap(…)))` sit lexically
inside the method's initializer, so they are attributed to the right method without any
RxJS modelling.

**2. Template event bindings give the upstream callers.** `parseTemplate` from
`@angular/compiler` 20.3 yields:

```
dynamic-form.component  (valueChange) -> store.setValue      (blurred) -> store.markTouched
                        (submit)      -> onSubmit
field.component         (input)       -> onInput             (blur)    -> blurred.emit
```

With the component's class type, `store.setValue` resolves to the store method. With
`<app-field>`'s output declarations, `blurred.emit` in `FieldComponent` connects to the
parent's `(blurred)` handler. The full upstream chain is therefore available statically:
user blur → `FieldComponent` emits `blurred` → `DynamicFormComponent` template →
`DynamicFormStore.markTouched`.

## Architecture

```
            ┌──────────────── per revision (cached by commit SHA) ────────────────┐
 git rev ─► │ Checkout ─► Extract ─► Canonical graph (graph.json)                 │
            └──────────────────────────────────────────────────────────────────────┘
                                         │                 │
                     single revision ────┤                 ├──── base + head
                                         ▼                 ▼
                                  Slice (scope)      Diff + classify ─► Slice (changes)
                                         │                 │
                                         └──► Render ◄─────┘
                                     Mermaid · HTML · JSON · DOT
```

Each stage is a pure function of its inputs. Only Checkout touches git or the file
system.

### 1. Checkout

- `git worktree add --detach <tmp> <sha>` for each revision. Tsconfig paths, `templateUrl`
  files and project layout then all work unchanged.
- Types are required, since resolution depends on `@ngrx/signals`' declarations. If the
  revision's lockfile matches the current checkout's, symlink the existing `node_modules`.
  Otherwise run `npm ci --ignore-scripts` in the worktree. The lockfile hash is recorded in
  the output, because it is part of the input.
- Graphs are cached as `<cacheDir>/<sha>-<lockHash>-<analyzerVersion>-<configHash>.json`,
  so CI re-runs and the base side of most PRs are free.

### 2. Extract → canonical graph

**Nodes** are functions with stable IDs: a relative path plus a qualified name, never a
line number.

| Kind | Example ID | Source |
|---|---|---|
| `store-method` (entry point) | `features/dynamic-form/dynamic-form.store.ts#DynamicFormStore.load` | Properties or methods of the object `withMethods` returns, including `rxMethod`/`signalMethod` |
| `store-helper` | `…#DynamicFormStore.(revalidate)` | Local functions in the `withMethods` factory |
| `store-computed`, `store-hook` | `…#DynamicFormStore.visibleErrors`, `…#DynamicFormStore.onInit` | `withComputed`, `withHooks` (hooks are implicit entry points) |
| `component-method`, `template-handler` | `…#DynamicFormComponent.onSubmit`, `…#DynamicFormComponent@template(blurred)` | Classes and parsed templates (`template`/`templateUrl`), plus `host` and `@HostListener` |
| `service-method`, `function` | `shared/api/form-api.client.ts#FormApiClient.submit` | Any class method or top-level function in the project |
| `external` | `@angular/common/http#HttpClient.get` | Declarations in `node_modules`. These are leaves, never expanded |

Each node also carries:

- **Signature:** parameter and return types, printed by the checker.
- **Implementation fingerprint:** a SHA-256 of the body's token stream, without comments or
  whitespace. Formatting-only changes don't alter it.
- **State effects:** the state keys it writes through `patchState(store, {…})` and the
  signals it reads. Reads are kept in the graph but hidden by default.
- Source location, used only for links.

Custom `signalStoreFeature`s compose the same way. The checker follows a method back to
the feature that declares it, so the node belongs to the feature's file, and the store
records which features it includes.

**Edges** are typed:

| Kind | Meaning |
|---|---|
| `call` | Direct call resolved by the checker |
| `template` | Template event binding → handler expression's calls |
| `emit` | `output.emit()` → every parent template binding of that output in the project |
| `reference` | A function passed as a value (callback, `subscribe(handler)`) |
| `inject` | Resolution went through an abstract class or `InjectionToken` (see Limits) |

Each edge also records its **context**: the RxJS operators it runs inside
(`switchMap > tap`, `catchError`), and whether it sits inside a conditional or loop. That
context is what turns "`notifier.error` is still called" into "`notifier.error` moved from
`tap` to `catchError`", and makes `switchMap` → `exhaustMap` visible.

**Canonical form.** Nodes and edges are sorted by ID. Arrays are sorted and objects get
stable key order. There are no timestamps or absolute paths. The output is pretty-printed
with a trailing newline. `graph.json` is the tool's real contract. Every diagram is
rendered from it.

### 3. Diff and classify

The diff pairs nodes by ID. Unpaired nodes on each side are matched as **renamed or moved**
when their fingerprints are equal, or when their callee sets overlap at least 80%. Ties
are broken by ID, so the matching is deterministic. The classification:

| Class | Rule | Shown as |
|---|---|---|
| **Added / removed method** | Node on one side only | Green / red node |
| **Structural change** | Outgoing edge set differs (callee added or removed), or signature changed | Amber node; added and removed edges drawn green and red |
| **Edge context change** | Same callee, but the RxJS operator chain or conditional context differs | Dashed amber edge with old → new context |
| **Implementation-only change** | Fingerprint differs, but edges and signature are identical | Node outlined, no edge changes. "Body changed, calls didn't" |
| **State-effect change** | Different `patchState` keys written | Note on the node (`+ writes clientErrors`) |
| **Renamed / moved** | Paired by the rule above | Node labelled `was …` |
| Unchanged | Same fingerprint and edges | Neutral, collapsed where possible |

Example, `fixtures/base` → `fixtures/pr` (by hand, to illustrate):

- `DynamicFormStore.markTouched`: **structural**. New edges to `(revalidate)` →
  `RulesEngine.validate` and to `(verifyVat)` → `FormApiClient.verifyVat`. New state write:
  `clientErrors`.
- `DynamicFormStore.load`: **structural**. New edge to `Analytics.track` (context
  `switchMap > tap`); the `getDefinition` edge context changes to
  `switchMap > defer > retry`.
- `DynamicFormStore.submit`: **structural**. Direct `RulesEngine.validate` replaced by
  `(revalidate)`; new `Analytics.track` edges in the success and rejection branches.
- `DynamicFormStore.visibleErrors`: **structural**. No longer calls the removed
  `clientErrors` computed; new read of `verifications`.
- `FormApiClient.getOptions`: **signature change**, shown with its affected caller
  `(loadOptions)`.
- `DynamicFormComponent.hintFor`: **added**. Caller: the template's `[hint]` binding.

### 4. Slice: keeping diagrams small

A **seed set** is chosen first:

- **Diff mode:** every node that isn't unchanged.
- **Single revision:** the selected store's methods, or everything matching `--entry`.

The diagram then includes:

1. **Downstream:** from each seed, callees up to `--depth` (default 3). External and
   `node_modules` nodes are leaves.
2. **Entry points:** the store methods that can reach a seed. The graph is entered through
   the SignalStore API even when only a service changed.
3. **Upstream:** callers of those entry points up to `--up` (default 2). That usually
   covers the component method or template binding, and the child component output that
   triggers it.
4. **Unchanged subtrees** with no seed below them collapse into one `… N calls` node.

There is a **node budget** (default 40 per diagram). When a diagram exceeds it, the
deepest unchanged nodes are removed first, in ID order, so pruning is deterministic. If
a slice still doesn't fit, it is split into one diagram per entry point. Signal reads,
`patchState` and RxJS operators aren't nodes. They appear only as edge context and node
notes.

### 5. Render

- **Mermaid `flowchart LR`**, grouped into `subgraph`s by store, component and service
  folder (configurable, like the boxes in `signal-trace`). GitHub renders it inline in PR
  comments. The text is emitted in sorted order, so it is byte-stable.
- **HTML report:** self-contained, rendered with Pele like `signal-trace`. It has a
  per-entry-point index, before/after/diff views and source links.
- **JSON** (`graph.json`, `diff.json`) for other tools, and optionally **DOT**.
- Layout is left to the renderer. The tool never emits coordinates, so the output stays
  stable.

## Package shape and integration

A workspace package beside `signal-trace` (working name `store-callgraph`), installed as a
dev dependency of the Angular app:

```
store-callgraph/
  src/checkout   git worktree, node_modules reuse, cache
  src/extract    program setup, SignalStore recognizer, templates, edges
  src/resolve    SymbolResolver interface + TS 5.x backend
  src/graph      model, canonicalize, slice
  src/diff       pairing, classification
  src/render     mermaid, html, markdown comment
  src/cli.ts
```

- **Peer dependencies:** `typescript` and `@angular/compiler`, taken from the app. The
  analyzed project's template syntax and type semantics then match its build.
- **No runtime footprint:** nothing is imported into the app and no `withTracing` is
  needed. SignalStores are recognized by the checker resolving `signalStore`/`withMethods`
  to `@ngrx/signals`, not by name.
- **Configuration**, in `store-callgraph.config.json` or the `package.json` field:
  `project` (tsconfig), `entries` (store globs), `groups`, `external` patterns, `depth`,
  `up`, `budget`, `providers` (token → implementation overrides).
- **CLI:**
  ```bash
  store-callgraph graph [--rev <sha>] [--entry 'DynamicFormStore.*'] --out cg/
  store-callgraph diff --base origin/main --head HEAD --out cg-diff/   # comment.md, index.html, diff.json
  ```
- **API:** `graphAt(rev, config)`, `diffGraphs(base, head)`, `slice(...)`, `render*(...)`, so
  it can run from an Nx target, a custom builder or a GitHub Action.
- **CI:** one job that runs `diff` against the merge base and upserts `comment.md`. It needs
  no test run, so it can start at the same time as the build.
- **Sharing with `signal-trace`:** the Pele HTML shell, the PR-comment size management and
  the Mermaid diff colouring are the same problems. Move them into a small shared module
  once both tools exist. Don't merge the tools.

## Limits and how each is handled

| Case | Handling |
|---|---|
| Abstract class / `InjectionToken` with `useClass`/`useExisting`/`useFactory` | Scan `providers` arrays in `app.config.ts`, routes, components and `providedIn`. One implementation → `inject` edge to it. Several or unknown → edge to the abstract node, marked as ambiguous. Can be pinned in config |
| Callbacks and higher-order functions | `reference` edge where a function is passed. A call through an untyped parameter becomes an `unresolved` leaf, never a guess |
| `effect()`, `watchState`, `withHooks`, `toObservable` | Their bodies become implicit entry nodes (`…#DynamicFormStore.onInit`, `…@effect#1`). Effect bodies are numbered by source order |
| Reactivity (a computed recalculating when state changes) | Not a call. It appears as state reads and writes on nodes, not edges. A later option could draw "writes X → recomputes Y" |
| Dynamic property access (`this[name]()`) | `unresolved` leaf |
| Router: guards, resolvers, lazy routes | Out of scope at first. Route-config callers can be added as upstream sources later |
| Large apps | One `ts.Program` per revision for the selected tsconfig, but nodes are only extracted and sliced for files the slice reaches. Cache per SHA |

## Determinism guarantees and how to test them

- **Inputs:** commit SHA, lockfile hash, analyzer version and config hash. All are written
  to the output header.
- **Output:** sorted, canonical and free of absolute paths, timestamps and locale-dependent
  sorting (`localeCompare` is never used; IDs are compared by code unit).
- **Tests:**
  - Golden files for `fixtures/base`, `fixtures/pr` and their diff.
  - Run twice and compare the bytes.
  - Run with the root file order shuffled.
  - Run from a different working directory.
- **Cross-check oracle:** every store/service edge in a `signal-trace` recording of the same
  revision must exist in the static graph. A missing one is an extractor bug.

## Plan

1. **Extractor** for one revision of `fixtures/pr`: store methods, helpers, service and
   function calls, canonical `graph.json`, golden tests.
2. **Angular edges:** templates (inline and `templateUrl`), outputs → parent bindings,
   hooks and effects, provider scanning.
3. **Slicing and Mermaid/HTML output** for a single revision.
4. **Checkout:** worktrees, `node_modules` reuse, cache, `graph --rev`.
5. **Diff:** pairing, classification, PR comment and HTML report. Goldens for
   `fixtures/base` → `fixtures/pr`.
6. **Optional:** a GitHub Action example, and the `signal-trace` overlay (edges the tests
   exercised).

## Open questions

1. **Shape of the real app.** How much does it rely on `templateUrl`, custom
   `signalStoreFeature`s, abstract services or `InjectionToken`s? Is it an Nx monorepo or a
   single CLI project? This decides how much of Phase 2 is needed early.
2. **Primary output.** Is a Mermaid diagram in the PR comment the main thing reviewers read,
   with HTML as the detail? Or is the HTML report primary?
3. **Name and home.** Should this be a new package in this repository, as proposed, or a
   separate repository?
4. **Runtime overlay.** Should the `signal-trace` overlay be in scope, or kept separate?
