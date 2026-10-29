import { DIFF_MARKS } from '../diff/describe';
import { type GraphNode, KIND_ORDER, type NodeKind } from '../graph/model';
import type { View, ViewEdge, ViewNode } from '../graph/slice';
import { shortName, siteText } from './labels';

/**
 * Translucent fills, as 8-digit hex because Mermaid splits styles on commas, so the
 * highlights read on light and dark themes alike. The same colours as plotline's.
 */
export const DIFF_STYLES = {
  added: 'fill:#2ea04329,stroke:#1f8a3b,stroke-width:2px',
  removed: 'fill:#da363324,stroke:#c2362f,stroke-width:2px,stroke-dasharray:4 3',
  changed: 'fill:#d4a72c3d,stroke:#a86b00,stroke-width:2px',
};

const EDGE_STYLES = {
  added: 'stroke:#1f8a3b,stroke-width:2px',
  removed: 'stroke:#c2362f,stroke-width:2px,stroke-dasharray:4 3',
  context: 'stroke:#2f5bd3,stroke-width:2px,stroke-dasharray:2 3',
};

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

/**
 * A `flowchart LR` of the view. Feature code is grouped by store, class or file; what it
 * calls outside the feature sits in one box, grouped by directory. In a diff, added,
 * removed and changed functions are marked + − Δ and filled, dependencies outside the
 * feature are labelled (new) or (removed), and calls are marked + − or ↕ (moved).
 */
export function mermaid(view: View): string {
  const ids = new Map(view.nodes.map((n, i) => [n.id, `n${i}`]));
  const lines = ['flowchart LR'];

  let group = 0;
  const box = (title: string, nodes: ViewNode[], indent: string) => {
    lines.push(`${indent}subgraph g${group++}["${escapeText(title)}"]`);
    for (const n of nodes) lines.push(`${indent}  ${ids.get(n.id)}${shape(n)}`);
    lines.push(`${indent}end`);
  };
  for (const [title, nodes] of groups(view.nodes.filter((n) => n.node.kind !== 'boundary'))) box(title, nodes, '  ');
  const outside = view.nodes.filter((n) => n.node.kind === 'boundary');
  if (outside.length) {
    lines.push(`  subgraph outside["Outside the feature"]`);
    for (const [title, nodes] of groups(outside)) box(title, nodes, '    ');
    lines.push('  end');
  }

  const styles: string[] = [];
  view.edges.forEach((e, i) => {
    const arrow = e.kind === 'read' ? '-.->' : e.kind === 'emit' ? '==>' : '-->';
    const label = edgeLabel(e);
    lines.push(`  ${ids.get(e.from)} ${arrow}${label ? `|"${escapeText(label)}"|` : ''} ${ids.get(e.to)}`);
    if (e.status !== 'unchanged') styles.push(`  linkStyle ${i} ${EDGE_STYLES[e.status]}`);
  });

  for (const op of ['added', 'removed', 'changed'] as const) {
    const marked = view.nodes.filter((n) => opOf(n) === op).map((n) => ids.get(n.id));
    if (!marked.length) continue;
    lines.push(`  classDef ${op} ${DIFF_STYLES[op]}`);
    lines.push(`  class ${marked.join(',')} ${op}`);
  }
  lines.push(...styles);
  return `${lines.join('\n')}\n`;
}

/** How a node is drawn in a diff: anything that changed but wasn't added or removed is Δ. */
function opOf(n: ViewNode): 'added' | 'removed' | 'changed' | undefined {
  if (n.status === 'unchanged') return undefined;
  return n.status === 'added' || n.status === 'removed' ? n.status : 'changed';
}

function shape(n: ViewNode): string {
  const [open, close] = SHAPES[n.node.kind];
  const op = opOf(n);
  const name = shortName(n.node);
  const boundary = n.node.kind === 'boundary';
  const title =
    op === 'added' || op === 'removed'
      ? boundary
        ? `${name} (${op === 'added' ? 'new' : 'removed'})`
        : `${DIFF_MARKS[op]} ${name}`
      : op === 'changed'
        ? `${DIFF_MARKS.changed} ${name}`
        : name;
  const notes = notesOf(n);
  if (n.hidden) notes.push(`⋯ ${n.hidden} more call${n.hidden > 1 ? 's' : ''}`);
  return `${open}"${[escapeText(title), ...notes.map((t) => `<small>${escapeText(t)}</small>`)].join('<br/>')}"${close}`;
}

/** Second lines: what changed about a Δ node, or what a plain node writes. */
function notesOf(n: ViewNode): string[] {
  const c = n.change;
  if (!c) return n.node.writes.length ? [`updates ${n.node.writes.join(', ')}`] : [];
  const notes: string[] = [];
  if (c.renamedFrom) notes.push(`was ${c.base?.name ?? c.renamedFrom}`);
  if (c.signature) notes.push(`was ${clip(c.signature.base, 48)}`);
  for (const k of c.writes?.added ?? []) notes.push(`+ updates ${k}`);
  for (const k of c.writes?.removed ?? []) notes.push(`− updates ${k}`);
  if (c.class === 'implementation') notes.push('body only');
  return notes;
}

function edgeLabel(e: ViewEdge): string {
  if (e.status === 'context') {
    const now = e.sites.map(siteText).filter(Boolean).join('; ') || 'direct';
    const was = (e.baseSites ?? []).map(siteText).filter(Boolean).join('; ') || 'direct';
    return `${DIFF_MARKS.moved} ${now}, was ${was}`;
  }
  // Otherwise only the callbacks every call site shares, to keep the diagram light.
  const shared = e.sites
    .map((s) => s.within)
    .reduce((common, chain) => {
      let i = 0;
      while (i < common.length && common[i] === chain[i]) i++;
      return common.slice(0, i);
    });
  const text = shared.join(' › ');
  if (e.status === 'unchanged') return text;
  const mark = DIFF_MARKS[e.status];
  return text ? `${mark} ${text}` : mark;
}

/** Groups in a fixed order: stores first, then classes, then files; by name within each. */
function groups(nodes: ViewNode[]): [string, ViewNode[]][] {
  const byGroup = new Map<string, ViewNode[]>();
  for (const n of nodes) {
    const list = byGroup.get(n.node.group);
    if (list) list.push(n);
    else byGroup.set(n.node.group, [n]);
  }
  const rank = (ns: ViewNode[]) => Math.min(...ns.map((n) => rankOf(n.node)));
  return [...byGroup.entries()].sort(([a, an], [b, bn]) => rank(an) - rank(bn) || (a < b ? -1 : a > b ? 1 : 0));
}

function rankOf(node: GraphNode): number {
  return KIND_ORDER.indexOf(node.kind);
}

function clip(text: string, length: number): string {
  return text.length > length ? `${text.slice(0, length - 1)}…` : text;
}

const MERMAID_ESCAPES: Record<string, string> = { '#': '#35;', ';': '#59;', '<': '#lt;', '>': '#gt;', '"': '#quot;' };

/** Mermaid treats `;` and `#` specially, `<`/`>` as HTML, `"` ends a label, and a newline ends the line. */
export function escapeText(text: string): string {
  return text.replace(/[#;<>"]/g, (c) => MERMAID_ESCAPES[c]).replace(/\r?\n/g, ' ⏎ ');
}
