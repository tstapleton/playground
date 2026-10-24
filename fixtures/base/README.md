# form-trace

Generates **sequence diagrams from integration test runs**. A Jest + Testing Library suite
renders the whole feature, with everything outside the feature mocked, and records who
called whom, with what data, and how store state changed. Each test writes one Mermaid
diagram to [`traces/`](traces/README.md).

The demo feature is a config-driven form (Angular 20, zoneless, NgRx SignalStore): the
backend sends the field definitions; the store handles loading, conditional fields,
dependent selects, validation and submit.

```bash
npm test             # normal run, tracing off (no providers added, no overhead)
npm run test:trace   # TRACE=1: also writes traces/<spec>/<test>.md
```

## What you add

| Where | What | Why |
|---|---|---|
| Store | `withTracing('Form store')`, before `withHooks` | Wraps the store's methods, watches its state and runs its computeds as the store. Does nothing unless the test harness provides `TRACE_SINK`. |
| Test render helper | `traced('Form API (mock)', { provide: FormApiClient, useValue: api })` | Names a mocked or real service as a participant. `{ methods: [...] }` limits which methods are shown. |
| Test render helper | `provideTracing({ ui: 'Dynamic form UI' })` | Turns tracing on for the render. |

Nothing else changes in the tests. User gestures are picked up from the DOM events that
`user-event` fires.

## How it works (`src/testing/trace`)

- **Participants.** Store methods and the methods of `traced` services are wrapped.
  A call between two participants becomes `A ->> B: method(args)`. Its result becomes a
  return arrow. For an Observable, each emission becomes a return arrow; for a Promise,
  the resolved value does.
- **Who is calling.** The current participant is kept in Node's `AsyncLocalStorage`.
  Work that continues after a timer, an observable emission or an `await` is still
  attributed correctly. Code outside any participant (DOM handlers, change detection) is
  the UI. Calls a participant makes to itself are left out, so the diagram shows boundaries only.
- **State.** `watchState` sends each `patchState` as a note of what changed
  (`status: "loading" → "ready"`).
- **User.** Capture-phase DOM listeners turn input, change and click events into
  `User ->> UI` messages. Repeated keystrokes on the same field are merged into one step.

## Known limits

- The diagram shows one run, the path this test took. It is not every possible path.
- `withTracing` must come after the features it should cover and before `withHooks`.
- Computeds the store doesn't expose are evaluated in their reader's context. Calls they
  make can show up as coming from the UI.
- Effects or timers driven by Jest fake timers run in the test's context, so they are
  attributed to the UI.
- Patching computeds relies on Angular's internal signal node (`SIGNAL`). That's
  acceptable in test-only code, but it can break on an Angular upgrade.
