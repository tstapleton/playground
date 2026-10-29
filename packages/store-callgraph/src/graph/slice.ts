import { ChangeClass, EdgeStatus, GraphDiff, NodeChange } from '../diff/diff';
import { fullName } from '../render/labels';
import { CallSite, EdgeKind, Graph, GraphNode, compare } from './model';

export interface ViewNode {
  id: string;
  node: GraphNode;
  status: ChangeClass;
  change?: NodeChange;
  /** Callees left out of this view. */
  hidden: number;
}

export interface ViewEdge {
  from: string;
  to: string;
  kind: EdgeKind;
  status: EdgeStatus;
  sites: CallSite[];
  /** The base side's sites, when they changed. */
  baseSites?: CallSite[];
}

/** A graph or diff, or part of one, ready to draw. */
export interface View {
  title: string;
  nodes: ViewNode[];
  edges: ViewEdge[];
}

export interface SliceOptions {
  /** How many calls to follow down from the changes (or from the entry point). */
  depth: number;
  /** How many callers to show above the entry point. */
  up: number;
  /** Most nodes per diagram. */
  budget: number;
}

export const DEFAULT_SLICE: SliceOptions = { depth: 1, up: 1, budget: 40 };

export function graphView(graph: Graph): View {
  return {
    title: graph.inputs.feature,
    nodes: graph.nodes.map((node) => ({ id: node.id, node, status: 'unchanged', hidden: 0 })),
    edges: graph.edges.map((e) => ({ from: e.from, to: e.to, kind: e.kind, status: 'unchanged', sites: e.sites })),
  };
}

export function diffView(diff: GraphDiff): View {
  return {
    title: diff.head.feature,
    nodes: diff.nodes.map((change) => ({ id: change.id, node: (change.head ?? change.base)!, status: change.class, change, hidden: 0 })),
    edges: diff.edges.map((e) => ({
      from: e.from,
      to: e.to,
      kind: e.kind,
      status: e.status,
      sites: (e.head ?? e.base)!.sites,
      ...(e.status === 'context' ? { baseSites: e.base!.sites } : {}),
    })),
  };
}

/** Nodes that changed in a diff view. */
export function changedIds(view: View): string[] {
  return view.nodes.filter((n) => n.status !== 'unchanged').map((n) => n.id);
}

/** The store methods, optionally filtered by a `*` pattern on their names. */
export function entryIds(view: View, pattern?: string): string[] {
  const match = pattern ? globMatcher(pattern) : () => true;
  return view.nodes.filter((n) => n.node.kind === 'store-method' && match(n.node.name)).map((n) => n.id);
}

/** One diagram per seed, e.g. per store method of a single revision. */
export function slicePerSeed(view: View, seeds: string[], options: SliceOptions): View[] {
  return seeds.map((seed) => ({ ...slice(view, [seed], [seed], [seed], options), title: nameOf(view, seed) }));
}

/**
 * The diagrams for a diff: one per store method that changed or reaches a change, showing
 * the paths from it to the changes. Changes no store method reaches (a computed, a
 * template) are drawn in further diagrams, one per connected group.
 */
export function slicePerEntry(view: View, options: SliceOptions): View[] {
  const changed = new Set(changedIds(view));
  const out = adjacency(view, 'out');
  const into = adjacency(view, 'in');
  const covered = new Set<string>();
  const views: View[] = [];

  for (const entry of entryIds(view)) {
    const reach = closure([entry], out);
    const targets = [...reach].filter((id) => changed.has(id));
    if (targets.length === 0) continue;
    // Only what lies on a path from the entry to a change.
    const between = [...closure(targets, into)].filter((id) => reach.has(id));
    views.push({ ...slice(view, between, targets, [entry], options), title: nameOf(view, entry) });
    targets.forEach((t) => covered.add(t));
  }

  const rest = [...changed].filter((id) => !covered.has(id));
  return [...views, ...sliceAround(view, rest, options)];
}

/** Everything within reach of the seeds, one diagram per connected group. */
export function sliceAround(view: View, seeds: string[], options: SliceOptions): View[] {
  if (seeds.length === 0) return [];
  const whole = slice(view, seeds, seeds, seeds, { ...options, budget: Number.MAX_SAFE_INTEGER });
  return components(whole)
    .map((component) => {
      const own = seeds.filter((s) => component.has(s));
      const v = slice(view, own, own, own, options);
      return { ...v, title: titleOf(v) };
    })
    .sort((a, b) => compare(a.nodes[0].id, b.nodes[0].id));
}

/**
 * The `core` nodes, plus callees `depth` levels below `down` and callers `up` levels above
 * `up`. Over budget, the added nodes furthest from the core are dropped first.
 */
function slice(view: View, core: string[], down: string[], up: string[], options: SliceOptions): View {
  const out = adjacency(view, 'out');
  const into = adjacency(view, 'in');
  const distance = new Map<string, number>(core.map((s) => [s, 0]));
  const walk = (from: string[], next: Map<string, string[]>, limit: number) => {
    let frontier = from;
    for (let d = 1; d <= limit && frontier.length; d++) {
      const following: string[] = [];
      for (const id of frontier) {
        for (const n of next.get(id) ?? []) {
          if (distance.has(n) && distance.get(n)! <= d) continue;
          distance.set(n, d);
          following.push(n);
        }
      }
      frontier = following;
    }
  };
  walk(down, out, options.depth);
  walk(up, into, options.up);

  const coreSet = new Set(core);
  const kept = new Set(distance.keys());
  const droppable = [...kept].filter((id) => !coreSet.has(id)).sort((a, b) => distance.get(b)! - distance.get(a)! || compare(b, a));
  while (kept.size > options.budget && droppable.length) kept.delete(droppable.shift()!);

  const nodes = view.nodes
    .filter((n) => kept.has(n.id))
    .map((n) => ({ ...n, hidden: new Set((out.get(n.id) ?? []).filter((c) => !kept.has(c))).size }));
  const edges = view.edges.filter((e) => kept.has(e.from) && kept.has(e.to));
  return { title: view.title, nodes, edges };
}

function adjacency(view: View, direction: 'out' | 'in'): Map<string, string[]> {
  const map = new Map<string, string[]>();
  for (const e of view.edges) {
    const [a, b] = direction === 'out' ? [e.from, e.to] : [e.to, e.from];
    (map.get(a) ?? map.set(a, []).get(a)!).push(b);
  }
  return map;
}

function closure(from: string[], next: Map<string, string[]>): Set<string> {
  const seen = new Set(from);
  const stack = [...from];
  while (stack.length) {
    for (const n of next.get(stack.pop()!) ?? []) {
      if (!seen.has(n)) {
        seen.add(n);
        stack.push(n);
      }
    }
  }
  return seen;
}

function components(view: View): Set<string>[] {
  const neighbours = new Map<string, string[]>(view.nodes.map((n) => [n.id, []]));
  for (const e of view.edges) {
    neighbours.get(e.from)!.push(e.to);
    neighbours.get(e.to)!.push(e.from);
  }
  const seen = new Set<string>();
  const result: Set<string>[] = [];
  for (const { id } of view.nodes) {
    if (seen.has(id)) continue;
    seen.add(id);
    const component = closure([id], neighbours);
    component.forEach((n) => seen.add(n));
    result.push(component);
  }
  return result;
}

function nameOf(view: View, id: string): string {
  return fullName(view.nodes.find((n) => n.id === id)!.node);
}

function titleOf(view: View): string {
  const names = view.nodes.filter((n) => n.status !== 'unchanged').map((n) => fullName(n.node));
  return names.length > 3 ? `${names.slice(0, 3).join(', ')} and ${names.length - 3} more` : names.join(', ');
}

/** `*` matches any run of characters; nothing else is special. */
export function globMatcher(pattern: string): (text: string) => boolean {
  const re = new RegExp(`^${pattern.split('*').map((p) => p.replace(/[.+?^${}()|[\]\\]/g, '\\$&')).join('.*')}$`);
  return (text) => re.test(text);
}
