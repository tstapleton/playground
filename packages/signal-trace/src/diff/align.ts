import { mergeRepeatedGestures, shape } from '../core/merge';
import { describeChange, TraceEvent, TraceFile, traceKey } from '../core/model';

export type DiffOp =
  | { op: 'same'; event: TraceEvent }
  | { op: 'added'; event: TraceEvent }
  | { op: 'removed'; event: TraceEvent }
  /** Same participants and method (or state keys) as before, different data. */
  | { op: 'changed'; event: TraceEvent; before: TraceEvent };

export type TestStatus = 'added' | 'removed' | 'changed' | 'unchanged';

export interface TestDiff {
  key: string;
  spec: string;
  test: string;
  status: TestStatus;
  base?: TraceFile;
  head?: TraceFile;
  ops: DiffOp[];
  counts: { added: number; removed: number; changed: number };
  participants: { added: string[]; removed: string[] };
}

/** Pairs tests across two runs by spec and name, and diffs each pair. */
export function diffRuns(base: TraceFile[], head: TraceFile[]): TestDiff[] {
  const baseByKey = new Map(base.map((t) => [traceKey(t), t]));
  const headByKey = new Map(head.map((t) => [traceKey(t), t]));
  const keys = [...new Set([...headByKey.keys(), ...baseByKey.keys()])];
  return keys.map((key) => diffTest(baseByKey.get(key), headByKey.get(key)));
}

export function diffTest(base: TraceFile | undefined, head: TraceFile | undefined): TestDiff {
  const either = (head ?? base)!;
  const ops = diffEvents(base ? mergeRepeatedGestures(base.events) : [], head ? mergeRepeatedGestures(head.events) : []);
  const counts = { added: 0, removed: 0, changed: 0 };
  for (const o of ops) if (o.op !== 'same') counts[o.op]++;

  const before = new Set(base ? namesIn(base) : []);
  const after = new Set(head ? namesIn(head) : []);
  const status: TestStatus = !base ? 'added' : !head ? 'removed' : ops.every((o) => o.op === 'same') ? 'unchanged' : 'changed';

  return {
    key: traceKey(either),
    spec: either.spec,
    test: either.test,
    status,
    base,
    head,
    ops,
    counts,
    participants: {
      added: base ? [...after].filter((n) => !before.has(n)) : [],
      removed: head ? [...before].filter((n) => !after.has(n)) : [],
    },
  };
}

/**
 * Aligns two event lists with a weighted longest common subsequence: an identical
 * message scores 2, a message of the same shape with different data scores 1, so exact
 * matches win and changed data shows as "changed" rather than removed + added.
 */
export function diffEvents(base: TraceEvent[], head: TraceEvent[]): DiffOp[] {
  const n = base.length;
  const m = head.length;
  const baseShapes = base.map(shape);
  const headShapes = head.map(shape);
  const baseText = base.map(textOf);
  const headText = head.map(textOf);
  const score = (i: number, j: number) =>
    baseShapes[i] !== headShapes[j] ? 0 : baseText[i] === headText[j] ? 2 : 1;

  // best[i][j] = best score aligning base[i..] with head[j..]
  const best = Array.from({ length: n + 1 }, () => new Array<number>(m + 1).fill(0));
  for (let i = n - 1; i >= 0; i--) {
    for (let j = m - 1; j >= 0; j--) {
      const s = score(i, j);
      best[i][j] = Math.max(best[i + 1][j], best[i][j + 1], s ? s + best[i + 1][j + 1] : 0);
    }
  }

  const ops: DiffOp[] = [];
  let i = 0;
  let j = 0;
  while (i < n || j < m) {
    const s = i < n && j < m ? score(i, j) : 0;
    if (s && best[i][j] === s + best[i + 1][j + 1]) {
      ops.push(s === 2 ? { op: 'same', event: head[j] } : { op: 'changed', event: head[j], before: base[i] });
      i++;
      j++;
    } else if (j < m && (i === n || best[i][j + 1] >= best[i + 1][j])) {
      ops.push({ op: 'added', event: head[j++] });
    } else {
      ops.push({ op: 'removed', event: base[i++] });
    }
  }
  return ops;
}

/** Everything a reader sees for an event, used to decide "same" vs "changed". */
export function textOf(e: TraceEvent): string {
  switch (e.kind) {
    case 'user':
      return e.text;
    case 'note':
      return e.changes.map(describeChange).join('\n');
    default:
      return e.label;
  }
}

function namesIn(trace: TraceFile): string[] {
  const names = new Set<string>([trace.ui]);
  for (const e of trace.events) {
    if (e.kind === 'note') names.add(e.over);
    else if (e.kind !== 'user') {
      names.add(e.from);
      names.add(e.to);
    }
  }
  return [...names];
}
