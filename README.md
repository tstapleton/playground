# playground

Experiments in showing what a pull request does to an Angular + NgRx SignalStore feature,
beyond the line diff: runtime sequence diagrams from integration tests, and static call graphs.

| Path | What |
|---|---|
| [`packages/signal-trace`](packages/signal-trace) | The first version of [plotline](https://github.com/tstapleton/plotline), which has moved to its own repository. The fixtures still use it |
| [`fixtures/base`](fixtures/base) | Demo feature: a config-driven form on Angular 20 and NgRx SignalStore |
| [`fixtures/pr`](fixtures/pr) | The same feature with a pull request's worth of changes |
| [`packages/store-callgraph`](packages/store-callgraph) | Static call graphs of a feature, diffed between two revisions in plotline's style |
| [`docs/call-graph-proposal.md`](docs/call-graph-proposal.md) | The design behind `store-callgraph` |
| [`examples/callgraph-diff`](examples/callgraph-diff) | `store-callgraph`'s diff between the two: [PR comment](examples/callgraph-diff/comment.md) and [HTML report](examples/callgraph-diff/index.html) |
| [`examples/trace-diff`](examples/trace-diff) | The diff between the two: [PR comment](examples/trace-diff/comment.md) and [HTML report](examples/trace-diff/index.html) |

```bash
npm install
npm test                # unit tests and both fixture suites
npm run demo:diff       # trace both fixtures and write examples/trace-diff
npm run demo:callgraph  # diff the fixtures' call graphs and write examples/callgraph-diff
```
