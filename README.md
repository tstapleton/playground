# playground

Experiments in generating sequence diagrams from Angular integration tests, and in
diffing them on pull requests.

| Path | What |
|---|---|
| [`packages/signal-trace`](packages/signal-trace) | The tool: records traces in Jest, renders them with Pele, diffs two runs |
| [`fixtures/base`](fixtures/base) | Demo feature: a config-driven form on Angular 20 and NgRx SignalStore |
| [`fixtures/pr`](fixtures/pr) | The same feature with a pull request's worth of changes |
| [`examples/trace-diff`](examples/trace-diff) | The diff between the two: [PR comment](examples/trace-diff/comment.md) and [HTML report](examples/trace-diff/index.html) |

```bash
npm install
npm test              # diff unit tests and both fixture suites
npm run demo:diff     # trace both fixtures and write examples/trace-diff
```
