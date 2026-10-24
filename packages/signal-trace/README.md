# signal-trace

Sequence diagrams of an Angular + NgRx SignalStore feature, recorded from its Jest
integration tests. Each test produces one diagram: user gestures, calls between the UI,
stores and services, what they returned, and how store state changed.

Two runs can be **diffed**, which turns "what does this PR change about how the feature
behaves?" into a highlighted diagram per test.

## Set up

In each store, after the features to trace and before `withHooks`:

```ts
export const DynamicFormStore = signalStore(
  withState(initialState),
  withComputed(/* … */),
  withMethods(/* … */),
  withTracing('Form store'), // from 'signal-trace/store'; does nothing in the app
);
```

In the Jest setup file:

```ts
import { installTraceHooks } from 'signal-trace/jest';
installTraceHooks();
```

In the test's render helper, name the participants. Your existing mocks stay as they are;
only the provider is wrapped:

```ts
await render(DynamicFormComponent, {
  providers: [
    traced('Form API', { provide: FormApiClient, useValue: api }, { group: 'Host app (mocked)' }),
    traced('Rules engine', RulesEngine, { methods: ['validate'], group: 'Dynamic form feature' }),
    provideTracing({ ui: 'UI', group: 'Dynamic form feature' }),
  ],
});
```

- `traced(name, provider, options)` makes a service (real or mocked) a participant.
  `methods` limits which methods are shown. `group` draws it inside a titled box.
- `provideTracing({ ui, group })` turns tracing on and names the UI and the box for the
  UI and stores.

Both helpers do nothing unless the run sets `TRACE=1`, so `npm test` is unaffected.

## Commands

```bash
TRACE=1 jest                                    # writes traces/<spec>/<test>.json and .md (Mermaid)
signal-trace report traces --out traces/report  # one HTML page, every diagram rendered with Pele
signal-trace diff <base-traces> <head-traces> --out trace-diff \
  [--base-label main] [--head-label my-branch] [--report-url <link>]
```

`TRACE_DIR` changes where traces are written, so two runs can sit side by side.

`diff` writes:

- **`comment.md`**: for a pull-request comment. It has a summary table, a Mermaid diff
  diagram per changed test (GitHub renders these), and the same changes as text. It stays
  under GitHub's size limit.
- **`index.html`**: a self-contained report rendered with [Pele](https://pele.run). It
  has the same diffs, plus before and after diagrams side by side.

## Reading a diff

Tests are paired by spec file and name. A test that exists on only one side is treated as
**renamed** if at least 60% of its steps match a test on the other side.

Within a test, steps are aligned like a text diff, but by message rather than by line:

| Mark | Meaning |
|---|---|
| `+` | added: this step only happens on the PR side |
| `−` | removed: this step only happens on the base side |
| `Δ` | changed: same participants and method (or state keys), different data; a note shows the old value |
| `↕` | moved: the same message, now at a different point within the same user gesture |

New participants are labelled `(new)`, and ones no longer called are labelled `(removed)`.
Unchanged stretches longer than two steps either side of a change are collapsed.

## Running it on pull requests

Not built yet. The job would:

1. Check out the base branch, install, run `TRACE=1 TRACE_DIR=traces-base jest`.
2. Check out the PR, run `TRACE=1 TRACE_DIR=traces-head jest`.
3. Run `signal-trace diff traces-base traces-head --out trace-diff --report-url <artifact link>`.
4. Post or update `trace-diff/comment.md` as a PR comment, and upload `index.html` as an artifact.

`npm run demo:diff` at the repository root does steps 1 to 3, using `fixtures/base` and
`fixtures/pr` as the two checkouts. Output is deterministic, so re-running it on an
unchanged PR gives an identical comment.

## How recording works

- **Participants.** Store methods and the methods of `traced` services are wrapped.
  A call between two participants becomes `A ->> B: method(args)`, and its result becomes
  a return arrow. For an Observable, each emission becomes a return arrow; for a Promise,
  the resolved value does.
- **Who is calling.** The current participant is kept in Node's `AsyncLocalStorage`.
  Work that continues after a timer, an observable emission or an `await` is still
  attributed correctly. Code outside any participant (DOM handlers, change detection) is
  the UI. Calls a participant makes to itself are left out, so the diagram shows
  boundaries only.
- **State.** `watchState` sends each `patchState` as a note of what changed
  (`status: "loading" → "ready"`).
- **User.** Capture-phase DOM listeners turn input, change and click events into
  `User ->> UI` messages. Repeated keystrokes on the same field are merged into one step.

## Known limits

- A diagram shows one run, the path this test took. It is not every possible path.
- `withTracing` must come after the features it should cover and before `withHooks`.
- Computeds the store doesn't expose are evaluated in their reader's context. Calls they
  make can show up as coming from the UI.
- Effects or timers driven by Jest fake timers run in the test's context, so they are
  attributed to the UI.
- Patching computeds relies on Angular's internal signal node (`SIGNAL`). That's
  acceptable in test-only code, but it can break on an Angular upgrade.
- Labels summarise data (`{id: "vendor-onboarding", …}`). A change hidden inside the
  summary won't show as `Δ`.

## Layout

| Path | What |
|---|---|
| `src/store` | `withTracing` and `TRACE_SINK`: the only part the app imports |
| `src/jest` | The recorder: tracer, DOM recorder, providers, Jest hooks |
| `src/core` | Trace model, gesture merging, Mermaid output (no Angular imports) |
| `src/report` | Pele HTML report |
| `src/diff` | Alignment, diff diagram, PR comment and HTML diff |
| `test` | Unit tests for the diff (`npm test`) |
