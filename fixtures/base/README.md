# fixture-base

Demo feature for [signal-trace](../../packages/signal-trace): a form whose fields, rules
and sections come from backend configuration. It uses Angular 20 (zoneless), NgRx
SignalStore and Jest with Testing Library.

The integration tests in `src/app/features/dynamic-form` render the whole feature and
mock everything outside it (`src/app/shared`).

```bash
npm test               # normal run
npm run test:trace     # also writes traces/<spec>/<test>.json and .md
npm run trace:report   # renders them to traces/report/index.html with Pele
```

This is the "base" side of the demo diff; [`fixtures/pr`](../pr) is the "PR" side.
