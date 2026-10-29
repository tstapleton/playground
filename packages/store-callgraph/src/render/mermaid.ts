import { ChangeClass } from '../diff/diff';
import { GraphNode, NodeKind } from '../graph/model';
import { View, ViewEdge, ViewNode } from '../graph/slice';
import { shortName, sitesText } from './labels';

const SHAPES: Record<NodeKind, [string, string]> = {
  'store-method': ['([', '])'],
  'store-helper': ['[', ']'],
  'store-computed': ['{{', '}}'],
  'store-hook': ['[/', '/]'],
  'class-method': ['(', ')'],
  'class-field': ['(', ')'],
  'template-handler': ['>', ']'],
  'template-render': ['[/', '/]'],
  function: ['(', ')'],
  boundary: ['[[', ']]'],
  unresolved: ['((', '))'],
};

const CLASS_DEFS: Partial<Record<ChangeClass, string>> = {
  added: 'fill:#dcf3e1,stroke:#1f8a3b,stroke-width:2px,color:#1d1c1a',
  removed: 'fill:#fbe0de,stroke:#c2362f,stroke-width:2px,stroke-dasharray:5 3,color:#1d1c1a',
  structural: 'fill:#fff1cc,stroke:#a86b00,stroke-width:2px,color:#1d1c1a',
  context: 'fill:#fff8e6,stroke:#a86b00,stroke-width:2px,stroke-dasharray:5 3,color:#1d1c1a',
  state: 'fill:#e7ecff,stroke:#2f5bd3,stroke-width:2px,color:#1d1c1a',
  implementation: 'stroke:#6b6862,stroke-width:3px',
  renamed: 'stroke:#2f5bd3,stroke-width:2px,stroke-dasharray:2 2',
};

const EDGE_STYLES: Partial<Record<ViewEdge['status'], string>> = {
  added: 'stroke:#1f8a3b,stroke-width:2px',
  removed: 'stroke:#c2362f,stroke-width:2px,stroke-dasharray:5 3',
  context: 'stroke:#a86b00,stroke-width:2px,stroke-dasharray:2 3',
};

const KIND_ORDER: NodeKind[] = ['store-method', 'store-hook', 'store-computed', 'store-helper', 'class-method', 'class-field', 'template-render', 'template-handler', 'function'];

/**
 * A `flowchart LR` of the view. Feature code is grouped by store, class or file; code it
 * calls outside the feature sits in one box, grouped by directory.
 */
export function mermaid(view: View): string {
  const ids = new Map(view.nodes.map((n, i) => [n.id, `n${i}`]));
  const lines = ['flowchart LR'];

  const inside = view.nodes.filter((n) => n.node.kind !== 'boundary');
  const outside = view.nodes.filter((n) => n.node.kind === 'boundary');
  let group = 0;
  const box = (title: string, nodes: ViewNode[], indent: string) => {
    lines.push(`${indent}subgraph g${group++}["${text(title)}"]`);
    for (const n of nodes) lines.push(`${indent}  ${ids.get(n.id)}${shape(n)}`);
    lines.push(`${indent}end`);
  };
  for (const [title, nodes] of groups(inside)) box(title, nodes, '  ');
  if (outside.length) {
    lines.push(`  subgraph outside["Outside the feature"]`);
    for (const [title, nodes] of groups(outside)) box(title, nodes, '    ');
    lines.push('  end');
  }

  const styles: string[] = [];
  view.edges.forEach((e, i) => {
    const arrow = e.kind === 'read' ? '-.->' : e.kind === 'emit' ? '==>' : '-->';
    const label = edgeLabel(e);
    lines.push(`  ${ids.get(e.from)} ${arrow}${label ? `|"${text(label)}"|` : ''} ${ids.get(e.to)}`);
    const style = EDGE_STYLES[e.status];
    if (style) styles.push(`  linkStyle ${i} ${style}`);
  });

  const used = new Set(view.nodes.map((n) => n.status));
  for (const [cls, def] of Object.entries(CLASS_DEFS)) {
    if (!used.has(cls as ChangeClass)) continue;
    lines.push(`  classDef ${cls} ${def}`);
    lines.push(`  class ${view.nodes.filter((n) => n.status === cls).map((n) => ids.get(n.id)).join(',')} ${cls}`);
  }
  lines.push(...styles);
  return lines.join('\n') + '\n';
}

function shape(n: ViewNode): string {
  const [open, close] = SHAPES[n.node.kind];
  const label = [text(shortName(n.node))];
  const change = n.change;
  if (change?.renamedFrom) label.push(small(`was ${change.base!.name}`));
  if (change?.signature) label.push(small('signature changed'));
  if (change?.writes) {
    label.push(...change.writes.added.map((k) => small(`+ writes ${k}`)), ...change.writes.removed.map((k) => small(`− writes ${k}`)));
  } else if (n.node.writes.length && !change) {
    label.push(small(`writes ${n.node.writes.join(', ')}`));
  }
  if (n.hidden) label.push(small(`… ${n.hidden} more call${n.hidden > 1 ? 's' : ''}`));
  return `${open}"${label.join('<br/>')}"${close}`;
}

function edgeLabel(e: ViewEdge): string {
  if (e.status === 'context') return `was ${sitesText(e.baseSites!)}, now ${sitesText(e.sites)}`;
  // Other edges only show the callbacks every call site shares, to keep the diagram light.
  const chains = e.sites.map((s) => s.within);
  const shared = chains.reduce((common, chain) => common.filter((op, i) => chain[i] === op && common.slice(0, i).every((c, j) => chain[j] === c)));
  return shared.join(' › ');
}

/** Groups in a fixed order: stores first, then classes, then files; by name within each. */
function groups(nodes: ViewNode[]): [string, ViewNode[]][] {
  const byGroup = new Map<string, ViewNode[]>();
  for (const n of nodes) (byGroup.get(n.node.group) ?? byGroup.set(n.node.group, []).get(n.node.group)!).push(n);
  const rank = (ns: ViewNode[]) => Math.min(...ns.map((n) => rankOf(n.node)));
  return [...byGroup.entries()].sort(([a, an], [b, bn]) => rank(an) - rank(bn) || (a < b ? -1 : a > b ? 1 : 0));
}

function rankOf(node: GraphNode): number {
  const i = KIND_ORDER.indexOf(node.kind);
  return i < 0 ? KIND_ORDER.length : i;
}

function small(s: string): string {
  return `<small>${text(s)}</small>`;
}

/** Escapes text for a quoted Mermaid label. */
function text(s: string): string {
  return s.replace(/"/g, '#quot;').replace(/</g, '#lt;').replace(/>/g, '#gt;');
}
