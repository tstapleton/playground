import { CallSite, Graph, GraphEdge, GraphNode, compare, edgeKey, siteKey } from './model';

const sortedUnique = (values: string[]) => [...new Set(values)].sort(compare);

/** Sorts everything and fixes key order, so equal graphs serialize to equal bytes. */
export function canonicalize(graph: Graph): Graph {
  const nodes = [...graph.nodes].sort((a, b) => compare(a.id, b.id)).map(canonicalNode);
  const merged = new Map<string, GraphEdge>();
  for (const edge of graph.edges) {
    const key = edgeKey(edge);
    const existing = merged.get(key);
    if (existing) existing.sites.push(...edge.sites);
    else merged.set(key, { from: edge.from, to: edge.to, kind: edge.kind, sites: [...edge.sites] });
  }
  const edges = [...merged.values()]
    .map((e) => ({ from: e.from, to: e.to, kind: e.kind, sites: canonicalSites(e.sites) }))
    .sort((a, b) => compare(edgeKey(a), edgeKey(b)));
  const { feature, revision, analyzer } = graph.inputs;
  const inputs: Graph['inputs'] = revision ? { feature, revision, analyzer } : { feature, analyzer };
  return { version: graph.version, inputs, nodes, edges };
}

function canonicalNode(node: GraphNode): GraphNode {
  const out: GraphNode = {
    id: node.id,
    kind: node.kind,
    name: node.name,
    file: node.file,
    line: node.line,
    group: node.group,
    signature: node.signature,
    fingerprint: node.fingerprint,
    reads: sortedUnique(node.reads),
    writes: sortedUnique(node.writes),
  };
  if (node.via) out.via = node.via;
  return out;
}

function canonicalSites(sites: CallSite[]): CallSite[] {
  const byKey = new Map(sites.map((s) => [siteKey(s), { within: [...s.within], piped: [...s.piped], branch: [...s.branch] }]));
  return [...byKey.entries()].sort(([a], [b]) => compare(a, b)).map(([, s]) => s);
}

export function serialize(graph: Graph): string {
  return JSON.stringify(canonicalize(graph), null, 2) + '\n';
}
