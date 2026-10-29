# Proposal: static call graphs and call-graph diffs for SignalStore features

Status: proposal, nothing built yet. Revised with answers on the target app (see
[Decisions](#decisions-so-far)).

## The problem

A code diff shows which lines changed. It doesn't show what those lines do to the feature:
that `markTouched` now validates the form and calls an external registry, or that a
notification moved from one error path to another. Reviewers have to work that out by
reading every changed method and following its callers and callees by hand.

The tool should answer that question with a diagram, starting from the NgRx SignalStore
methods (`withMethods`) that make up a feature's public API. The diagram has to be
reproducible: the same two revisions always produce the same output, with no LLM involved.

The scope is **one feature directory at a time**. The tool shows how code inside the
feature calls itself and what it calls outside the feature. It doesn't follow calls past
that boundary.

## Decisions so far

| Question | Answer | Effect on the design |
|---|---|---|
| Templates | Inline only | Only the `template:` string is parsed. `templateUrl` is not supported at first |
| SignalStore features | No custom `signalStoreFeature`s yet | Recognize `signalStore(withState, withComputed, withMethods, withHooks)` directly. Features can be added later; the checker already follows them |
| Abstract services and `InjectionToken`s | None inside the feature, some outside | Since nothing past the boundary is followed, these never need resolving to an implementation. A call to one is shown as a boundary node named after the token or abstract class (see [Feature boundary](#feature-boundary)). Provider scanning is dropped |
| What matters | Inside the feature, and its calls out. Not what happens outside | Code outside the feature directory becomes boundary nodes: leaves that are never expanded |
| PR comment or HTML report | Undecided; depends on diagram size | Both are generated. A size rule picks what goes inline in the comment (see [Render](#5-render)) |
| Where it lives | A new repository, to be created | A standalone npm package. This repository's two fixture apps become its test fixtures |
| Runtime overlay (`signal-trace`) | Not wanted | Out of scope. The tool is static only |

## Static analysis or runtime instrumentation

There are two ways to get a call graph. Static analysis reads the source and the types.
Runtime instrumentation records calls while the code runs, usually from tests. This
repository has a runtime prototype, `packages/signal-trace`. It records sequence diagrams
during Jest integration tests and diffs them between two branches. It was the starting
point for this comparison.

| | Static analysis (TypeScript checker + Angular template parser) | Runtime instrumentation |
|---|---|---|
| Coverage | Every call written in the code, including error paths no test reaches | Only the paths the tests take |
| What it needs | Source and `node_modules` for the revision | A working test suite, instrumentation in each store, and wrapped providers |
| Works on any revision | Yes. Checkout and type-check only | Only if that revision's tests run and pass |
| Determinism | Fully deterministic: the same source, lockfile and analyzer always give the same graph | Depends on async ordering, fake timers and test data |
| Precision | Over-approximates: it shows calls that *can* happen, including both branches of an `if` | Exact for what happened, with real arguments and state changes |
| Dynamic dispatch | Weak in general, but limited to boundary nodes here, which are never expanded | Handled automatically |
| Speed | Seconds per revision | A full test run per revision |
| Answers | "What can this method reach, and how did that change?" | "What did this scenario do, and how did that change?" |

**Decision: static analysis only.** It covers any revision, is deterministic by
construction, needs no changes to the app, and shows structure rather than one scenario.
The feature boundary also removes its main weakness. Abstract services and injection
tokens all sit outside the feature, where the tool doesn't need to know what runs behind
them.

## Tools considered

| Tool | Granularity | Angular awareness | Fit |
|---|---|---|---|
| **TypeScript compiler API** (`ts.createProgram` + type checker) | Call expression → declaration | None by itself, but it resolves through SignalStore's generic types (verified below) | **Core of the proposal** |
| **`@angular/compiler` `parseTemplate`** | Template event bindings → method calls | Full Angular template syntax (control flow, `@let`, outputs) | **Use for inline templates** (verified below) |
| ts-morph | Wrapper over the TS API | None | Convenience only. It adds a dependency without adding capability |
| tsserver call hierarchy (`provideCallHierarchyOutgoingCalls`) | Method-level | None (no templates) | Useful as a cross-check in tests. One query per position is slow, and it doesn't capture RxJS context |
| ngtsc type-check blocks / Angular Language Service | Precise template symbols | Full | Private APIs that change between Angular majors. Keep as a fallback if `parseTemplate` + checker resolution falls short |
| [Jelly](https://github.com/cs-au-dk/jelly) (Aarhus University) | Points-to call graph, good with higher-order functions | None (no DI, no templates) | Research-grade and approximate. Type-based resolution is enough within one feature |
| CodeQL | Full call graph, database per revision | Limited | Heavy, not an npm package, and licensed only for public repos or GitHub Advanced Security |
| scip-typescript / LSIF | References, not calls | None | Would need post-processing into call edges |
| dependency-cruiser, madge, Nx graph | Module or project level | None or partial | Too coarse |
| Compodoc, ngrev | Module, component and DI level | Yes | No method-level call edges |
| Angular DevTools, OpenTelemetry, V8 coverage | Runtime | Partial | Runtime only; ruled out above |

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

## Feature boundary

The user gives a **feature directory**, for example `src/app/features/dynamic-form`. Every
function is either inside it or outside it:

- **Inside:** stores, components, services and functions under the directory. These are
  analyzed fully: bodies, fingerprints, outgoing calls, template bindings.
- **Outside:** everything else, including the rest of the app and `node_modules`. A call
  from inside to outside creates a **boundary node** for the callee. Boundary nodes are
  leaves. Their bodies are never read, and their own calls are never followed.

Each boundary node is named by **how the feature reaches it**, which is what a reviewer
recognizes:

| What the feature calls | Boundary node |
|---|---|
| A concrete class, e.g. `inject(FormApiClient).submit()` | `FormApiClient.submit` |
| An abstract class, e.g. `inject(PaymentGateway).charge()` | `PaymentGateway.charge` (abstract). No attempt to find the implementation |
| An `InjectionToken`, e.g. `inject(ANALYTICS).track()` | `ANALYTICS.track`, labelled with the token's name rather than the interface. The token is found by following the `inject(...)` argument back from the receiver |
| A top-level function, e.g. `formatDate(...)` | `shared/utils/date.ts#formatDate` |
| A framework or library API, e.g. `HttpClient.get` | Hidden by default: Angular, RxJS and `@ngrx/signals` calls are noise at this level. Configurable |

Boundary nodes are grouped in the diagram by where they live (`shared/api`, `shared/analytics`,
a library), so it's clear at a glance which other parts of the app the feature depends on.

Callers **outside** the feature (another feature using the store, a route, the app shell)
are not shown by default. An option adds them as one layer of boundary nodes for
features whose store is used elsewhere.

## Architecture

```
            ┌──────────────── per revision (cached by commit SHA) ────────────────┐
 git rev ─► │ Checkout ─► Extract (feature dir) ─► Canonical graph (graph.json)   │
            └──────────────────────────────────────────────────────────────────────┘
                                         │                 │
                     single revision ────┤                 ├──── base + head
                                         ▼                 ▼
                                  Slice (scope)      Diff + classify ─► Slice (changes)
                                         │                 │
                                         └──► Render ◄─────┘
                                       Mermaid · HTML · JSON
```

Each stage is a pure function of its inputs. Only Checkout touches git or the file
system.

### 1. Checkout

- `git worktree add --detach <tmp> <sha>` for each revision. Tsconfig paths and project
  layout then work unchanged.
- Types are required, since resolution depends on `@ngrx/signals`' declarations. If the
  revision's lockfile matches the current checkout's, symlink the existing `node_modules`.
  Otherwise run `npm ci --ignore-scripts` in the worktree. The lockfile hash is recorded in
  the output, because it is part of the input.
- Graphs are cached as `<cacheDir>/<sha>-<lockHash>-<analyzerVersion>-<configHash>.json`,
  so CI re-runs and the base side of most PRs are free.

### 2. Extract → canonical graph

The whole project is type-checked so that calls resolve, but nodes are only built for the
feature directory and its boundary.

**Nodes** have stable IDs: a path relative to the feature directory plus a qualified name,
never a line number. Boundary nodes use a path relative to the project root.

| Kind | Example ID | Source |
|---|---|---|
| `store-method` (entry point) | `dynamic-form.store.ts#DynamicFormStore.load` | Properties or methods of the object `withMethods` returns, including `rxMethod`/`signalMethod` |
| `store-helper` | `dynamic-form.store.ts#DynamicFormStore.(revalidate)` | Local functions in the `withMethods` factory |
| `store-computed`, `store-hook` | `…#DynamicFormStore.visibleErrors`, `…#DynamicFormStore.onInit` | `withComputed`, `withHooks` (hooks are implicit entry points) |
| `component-method`, `template-handler` | `…#DynamicFormComponent.onSubmit`, `…#DynamicFormComponent@template(blurred)` | Classes and parsed inline templates, plus `host` and `@HostListener` |
| `service-method`, `function` | `rules-engine.ts#RulesEngine.validate` | Any other class method or top-level function in the feature |
| `boundary` | `@app/shared/api/form-api.client.ts#FormApiClient.submit` | Anything outside the feature, named as in [Feature boundary](#feature-boundary) |

Each node inside the feature also carries:

- **Signature:** parameter and return types, printed by the checker.
- **Implementation fingerprint:** a SHA-256 of the body's token stream, without comments or
  whitespace. Formatting-only changes don't alter it.
- **State effects:** the state keys it writes through `patchState(store, {…})` and the
  signals it reads. Reads are kept in the graph but hidden by default.
- Source location, used only for links.

Boundary nodes carry only their signature, as seen from the call site.

**Edges** are typed:

| Kind | Meaning |
|---|---|
| `call` | Direct call resolved by the checker |
| `template` | Template event binding → handler expression's calls |
| `emit` | `output.emit()` → every parent template binding of that output inside the feature |
| `reference` | A function passed as a value (callback, `subscribe(handler)`) |

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
| **New / dropped dependency** | A boundary node that only one side calls | Green / red boundary node: the feature started or stopped depending on it |
| **Boundary signature change** | A boundary node's signature differs | Amber boundary node, with its callers in the feature |
| Unchanged | Same fingerprint and edges | Neutral, collapsed where possible |

Boundary nodes have no fingerprint, so a change inside an outside service never shows up.
Only its signature and who in the feature calls it are compared.

Example, `fixtures/base` → `fixtures/pr`, with `features/dynamic-form` as the feature (by
hand, to illustrate):

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
- `Analytics.track` and `FormApiClient.verifyVat`: **new dependencies** (boundary).
- `FormApiClient.getOptions`: **boundary signature change**, shown with its caller
  `(loadOptions)`.
- `DynamicFormComponent.hintFor`: **added**. Caller: the template's `[hint]` binding.

### 4. Slice: keeping diagrams small

A **seed set** is chosen first:

- **Diff mode:** every node that isn't unchanged.
- **Single revision:** the feature's store methods, or the ones matching `--entry`.

The diagram then includes:

1. **Downstream:** from each seed, callees up to `--depth` (default 3), stopping at
   boundary nodes.
2. **Entry points:** the store methods that can reach a seed. The graph is entered through
   the SignalStore API even when only a feature service changed.
3. **Upstream:** callers of those entry points inside the feature, up to `--up` (default 2).
   That usually covers the component method or template binding, and the child component
   output that triggers it.
4. **Unchanged subtrees** with no seed below them collapse into one `… N calls` node.

There is a **node budget** (default 40 per diagram). When a diagram exceeds it, the
deepest unchanged nodes are removed first, in ID order, so pruning is deterministic. If
a slice still doesn't fit, it is split into one diagram per entry point. Signal reads,
`patchState` and RxJS operators aren't nodes. They appear only as edge context and node
notes.

### 5. Render

- **Mermaid `flowchart LR`.** The feature's nodes sit in one `subgraph` per store,
  component and service. Boundary nodes sit in a second group, by location. GitHub renders
  Mermaid inline in PR comments. The text is emitted in sorted order, so it is byte-stable.
- **HTML report:** self-contained and rendered with a pinned Mermaid renderer. It has a
  per-entry-point index, before/after/diff views and source links.
- **JSON** (`graph.json`, `diff.json`) for other tools.
- Layout is left to the renderer. The tool never emits coordinates, so the output stays
  stable.

**What goes in the PR comment** is decided by a fixed size rule, since it depends on how
complex the change is:

- Each diagram with at most **25 nodes** is inlined as Mermaid.
- Larger diagrams are replaced by their **change list** (the classification table above
  as text) and a link to the HTML report.
- The comment always starts with a short summary: methods added, removed and changed, and
  dependencies gained and lost.
- If the whole comment would exceed GitHub's 65,536-character limit, diagrams are dropped
  from the largest down and replaced by links.

The thresholds are configurable, and their values are part of the config hash, so the
output stays reproducible.

## Package shape and integration

A standalone npm package in a new repository (working name `store-callgraph`), installed
as a dev dependency of the Angular app:

```
store-callgraph/
  src/checkout   git worktree, node_modules reuse, cache
  src/extract    program setup, SignalStore recognizer, templates, boundary, edges
  src/resolve    SymbolResolver interface + TS 5.x backend
  src/graph      model, canonicalize, slice
  src/diff       pairing, classification
  src/render     mermaid, html, markdown comment
  src/cli.ts
  test/fixtures  base/ and pr/ (copied from this repository's fixtures)
```

- **Peer dependencies:** `typescript` and `@angular/compiler`, taken from the app. The
  analyzed project's template syntax and type semantics then match its build.
- **No runtime footprint:** nothing is imported into the app. SignalStores are recognized
  by the checker resolving `signalStore`/`withMethods` to `@ngrx/signals`, not by name.
- **Configuration**, in `store-callgraph.config.json` or the `package.json` field:
  `project` (tsconfig), `feature` (directory), `entries` (method globs), `hide` (boundary
  patterns, Angular, RxJS and NgRx by default), `depth`, `up`, `budget`, `inlineLimit`.
- **CLI:**
  ```bash
  store-callgraph graph --feature src/app/features/dynamic-form [--rev <sha>] --out cg/
  store-callgraph diff  --feature src/app/features/dynamic-form \
                        --base origin/main --head HEAD --out cg-diff/   # comment.md, index.html, diff.json
  ```
  With no `--feature`, `diff` can analyze every feature directory the PR touches (matched
  by a configured glob such as `src/app/features/*`), producing one section each.
- **API:** `graphAt(rev, config)`, `diffGraphs(base, head)`, `slice(...)`, `render*(...)`, so
  it can run from an Nx target, a custom builder or a GitHub Action.
- **CI:** one job that runs `diff` against the merge base and upserts `comment.md`. It needs
  no test run, so it can start at the same time as the build.

## Limits and how each is handled

| Case | Handling |
|---|---|
| Abstract classes and `InjectionToken`s | Only outside the feature, so they are always boundary nodes named after the class or token. If one appears inside a feature later, the edge goes to the abstract node and is marked as having more than one possible implementation |
| Callbacks and higher-order functions | `reference` edge where a function is passed. A call through an untyped parameter becomes an `unresolved` leaf, never a guess |
| `effect()`, `watchState`, `withHooks`, `toObservable` | Their bodies become implicit entry nodes (`…#DynamicFormStore.onInit`, `…@effect#1`). Effect bodies are numbered by source order |
| Reactivity (a computed recalculating when state changes) | Not a call. It appears as state reads and writes on nodes, not edges |
| Dynamic property access (`this[name]()`) | `unresolved` leaf |
| `templateUrl` | Not supported at first; a warning names the component. Adding it later is small: read the file instead of the string |
| Custom `signalStoreFeature`s | Not needed yet. The checker already follows a method back to the feature that declares it, so supporting them later is mostly about labels |
| Large apps | One `ts.Program` per revision for the selected tsconfig, with nodes extracted only for the feature directory. Cache per SHA |

## Determinism guarantees and how to test them

- **Inputs:** commit SHA, lockfile hash, analyzer version and config hash. All are written
  to the output header.
- **Output:** sorted, canonical and free of absolute paths, timestamps and locale-dependent
  sorting (`localeCompare` is never used; IDs are compared by code unit).
- **Tests:**
  - Golden files for the `base` and `pr` fixtures and their diff.
  - Run twice and compare the bytes.
  - Run with the root file order shuffled.
  - Run from a different working directory.

## Plan

1. **Create the repository** and copy in `fixtures/base` and `fixtures/pr` as test
   fixtures, without `signal-trace`'s instrumentation (`withTracing` and the traced
   providers).
2. **Extractor** for one revision: feature boundary, store methods, helpers, feature
   services and functions, boundary nodes (classes, abstract classes, tokens), canonical
   `graph.json`, golden tests.
3. **Angular edges:** inline templates, outputs → parent bindings, hooks and effects.
4. **Slicing and Mermaid/HTML output** for a single revision.
5. **Checkout:** worktrees, `node_modules` reuse, cache, `graph --rev`.
6. **Diff:** pairing, classification, PR comment with the size rule, HTML report. Goldens
   for `base` → `pr`.
7. **Optional:** a GitHub Action example, and running `diff` over every feature a PR
   touches.

## Open questions

1. **Repository.** Once the new repository exists, it needs to be added to this session (or
   a new session started on it) before Phase 1.
2. **Callers from outside the feature.** Default is to leave them out. Are there features
   whose store is used elsewhere in the app, where seeing those callers would matter?
3. **Hidden boundary calls.** Angular, RxJS and NgRx calls are hidden by default. Should
   `HttpClient` calls made directly from inside a feature be shown, since they are its real
   outside dependency?
