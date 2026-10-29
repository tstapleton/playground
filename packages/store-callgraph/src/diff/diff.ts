import { Graph, GraphEdge, GraphNode, compare, edgeKey, siteKey } from '../graph/model';

/** How a node changed, most significant first. */
export type ChangeClass =
  | 'added'
  | 'removed'
  /** Calls something new, stopped calling something, or its signature changed. */
  | 'structural'
  /** Same calls, but one moved, e.g. from `tap` into `catchError`. */
  | 'context'
  /** Same calls; writes or reads different state. */
  | 'state'
  /** Same calls and state; only the body changed. */
  | 'implementation'
  /** Renamed or moved, otherwise unchanged. */
  | 'renamed'
  | 'unchanged';

export interface NodeChange {
  /** The head ID, or the base ID for removed nodes. */
  id: string;
  base?: GraphNode;
  head?: GraphNode;
  class: ChangeClass;
  renamedFrom?: string;
  signature?: { base: string; head: string };
  calls?: { added: string[]; removed: string[] };
  /** Callees whose call sites changed. */
  context?: string[];
  writes?: { added: string[]; removed: string[] };
  reads?: { added: string[]; removed: string[] };
  implementation?: boolean;
}

export type EdgeStatus = 'added' | 'removed' | 'context' | 'unchanged';

export interface EdgeChange {
  /** Head IDs; base IDs for edges whose endpoints were removed. */
  from: string;
  to: string;
  kind: GraphEdge['kind'];
  status: EdgeStatus;
  base?: GraphEdge;
  head?: GraphEdge;
}

export interface GraphDiff {
  base: Graph['inputs'];
  head: Graph['inputs'];
  nodes: NodeChange[];
  edges: EdgeChange[];
}

/** Share of callees two unpaired nodes must have in common to count as a rename. */
const RENAME_OVERLAP = 0.8;

export function diffGraphs(base: Graph, head: Graph): GraphDiff {
  const baseNodes = new Map(base.nodes.map((n) => [n.id, n]));
  const headNodes = new Map(head.nodes.map((n) => [n.id, n]));
  const renames = pairRenames(base, head, baseNodes, headNodes);
  const toHead = (id: string) => renames.get(id) ?? id;

  // Base edges in head IDs, so both sides can be compared by key.
  const baseEdges = new Map(base.edges.map((e) => [edgeKey({ ...e, from: toHead(e.from), to: toHead(e.to) }), e]));
  const headEdges = new Map(head.edges.map((e) => [edgeKey(e), e]));
  const edges: EdgeChange[] = [];
  for (const key of [...new Set([...baseEdges.keys(), ...headEdges.keys()])].sort(compare)) {
    const b = baseEdges.get(key);
    const h = headEdges.get(key);
    const e = (h ?? b)!;
    const status: EdgeStatus = !b ? 'added' : !h ? 'removed' : sitesKey(b) !== sitesKey(h) ? 'context' : 'unchanged';
    edges.push({ from: h ? h.from : toHead(b!.from), to: h ? h.to : toHead(b!.to), kind: e.kind, status, base: b, head: h });
  }

  const renamedFrom = new Map([...renames].map(([from, to]) => [to, from]));
  const nodes: NodeChange[] = [];
  for (const h of head.nodes) {
    const baseId = renamedFrom.get(h.id) ?? h.id;
    const b = baseNodes.get(baseId);
    if (!b) {
      nodes.push({ id: h.id, head: h, class: 'added' });
      continue;
    }
    nodes.push(compareNode(b, h, edges, baseId !== h.id ? baseId : undefined));
  }
  for (const b of base.nodes) {
    if (!renames.has(b.id) && !headNodes.has(b.id)) nodes.push({ id: b.id, base: b, class: 'removed' });
  }
  nodes.sort((a, b) => compare(a.id, b.id));

  return { base: base.inputs, head: head.inputs, nodes, edges };
}

function compareNode(b: GraphNode, h: GraphNode, edges: EdgeChange[], renamedFrom: string | undefined): NodeChange {
  const change: NodeChange = { id: h.id, base: b, head: h, class: 'unchanged' };
  if (renamedFrom) change.renamedFrom = renamedFrom;
  const outgoing = edges.filter((e) => e.from === h.id);
  const added = outgoing.filter((e) => e.status === 'added').map((e) => e.to);
  const removed = outgoing.filter((e) => e.status === 'removed').map((e) => e.to);
  const context = outgoing.filter((e) => e.status === 'context').map((e) => e.to);
  if (b.signature !== h.signature) change.signature = { base: b.signature, head: h.signature };
  if (added.length || removed.length) change.calls = { added, removed };
  if (context.length) change.context = context;
  const writes = setDiff(b.writes, h.writes);
  const reads = setDiff(b.reads, h.reads);
  if (writes) change.writes = writes;
  if (reads) change.reads = reads;
  if (b.fingerprint !== h.fingerprint) change.implementation = true;

  change.class =
    change.signature || change.calls
      ? 'structural'
      : change.context
        ? 'context'
        : change.writes || change.reads
          ? 'state'
          : change.implementation
            ? 'implementation'
            : renamedFrom
              ? 'renamed'
              : 'unchanged';
  return change;
}

/**
 * Pairs nodes that exist on one side only: same kind, and either an identical body or
 * mostly the same callees. Highest score first, ties broken by ID.
 */
function pairRenames(base: Graph, head: Graph, baseNodes: Map<string, GraphNode>, headNodes: Map<string, GraphNode>): Map<string, string> {
  const callees = (g: Graph) => {
    const map = new Map<string, Set<string>>();
    for (const e of g.edges) (map.get(e.from) ?? map.set(e.from, new Set()).get(e.from)!).add(e.to);
    return map;
  };
  const baseCallees = callees(base);
  const headCallees = callees(head);
  const onlyBase = base.nodes.filter((n) => !headNodes.has(n.id) && n.kind !== 'boundary' && n.kind !== 'unresolved');
  const onlyHead = head.nodes.filter((n) => !baseNodes.has(n.id) && n.kind !== 'boundary' && n.kind !== 'unresolved');

  const candidates: { score: number; from: string; to: string }[] = [];
  for (const b of onlyBase) {
    for (const h of onlyHead) {
      if (b.kind !== h.kind) continue;
      let score = 0;
      if (b.fingerprint && b.fingerprint === h.fingerprint) {
        score = 2;
      } else {
        const bc = baseCallees.get(b.id) ?? new Set();
        const hc = headCallees.get(h.id) ?? new Set();
        const union = new Set([...bc, ...hc]);
        const shared = [...bc].filter((c) => hc.has(c)).length;
        if (union.size >= 2) score = shared / union.size;
      }
      if (score >= RENAME_OVERLAP) candidates.push({ score, from: b.id, to: h.id });
    }
  }
  candidates.sort((x, y) => y.score - x.score || compare(x.from, y.from) || compare(x.to, y.to));
  const pairs = new Map<string, string>();
  const taken = new Set<string>();
  for (const c of candidates) {
    if (pairs.has(c.from) || taken.has(c.to)) continue;
    pairs.set(c.from, c.to);
    taken.add(c.to);
  }
  return pairs;
}

function sitesKey(edge: GraphEdge): string {
  return edge.sites.map(siteKey).join(';');
}

function setDiff(base: string[], head: string[]): { added: string[]; removed: string[] } | undefined {
  const added = head.filter((x) => !base.includes(x));
  const removed = base.filter((x) => !head.includes(x));
  return added.length || removed.length ? { added, removed } : undefined;
}
