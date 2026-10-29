import type { GraphNode } from '../graph/model';
import { siteText } from '../render/labels';
import type { EdgeChange, GraphDiff, NodeChange } from './diff';

export const DIFF_MARKS = { added: '+', removed: '−', changed: 'Δ', moved: '↕' } as const;

export type Op = keyof typeof DIFF_MARKS;

/**
 * One change as a sentence. `text` is Markdown: owners in **bold**, functions and
 * values in `code`.
 */
export interface Change {
  op: Op;
  key: string;
  text: string;
  /** How much a reviewer cares: calls 3, moved calls and state writes 2, reads and body-only edits 1. */
  weight: number;
  /** The nodes the change is about, to find the diagrams that show it. */
  ids: string[];
}

/** Every change in the diff, most important first, in ID order within each weight. */
export function describeDiff(diff: GraphDiff): Change[] {
  const nodes = new Map(diff.nodes.map((c) => [c.id, c.node]));
  const nodeOf = (id: string) => {
    const node = nodes.get(id);
    if (!node) throw new Error(`No node ${id} in the diff`);
    return node;
  };
  const changes: Change[] = [];

  for (const e of diff.edges) {
    if (e.status === 'unchanged') continue;
    changes.push(edgeChange(e, nodeOf(e.from), nodeOf(e.to)));
  }
  for (const c of diff.nodes) changes.push(...nodeChanges(c, diff.edges));

  // Stable sort keeps ID order within each weight.
  return changes.sort((a, b) => b.weight - a.weight);
}

/** The changes a diagram shows: those whose nodes are all in it. */
export function changesIn(changes: Change[], ids: Set<string>): Change[] {
  return changes.filter((c) => c.ids.every((id) => ids.has(id)));
}

function edgeChange(e: EdgeChange, from: GraphNode, to: GraphNode): Change {
  const verb = e.kind === 'read' ? 'reads' : e.kind === 'emit' ? 'emits to' : 'calls';
  const ids = [e.from, e.to];
  const key = `${e.status}|${e.from}|${e.kind}|${e.to}`;
  if (e.status === 'context') {
    const now = e.sites.map(siteText).filter(Boolean);
    const was = (e.baseSites ?? []).map(siteText).filter(Boolean);
    const where = `${now.length ? code(now.join('; ')) : 'directly'} (was ${was.length ? code(was.join('; ')) : 'direct'})`;
    return { op: 'moved', key, text: `${who(from)} ${verb} ${who(to)} at a different point: ${where}`, weight: 2, ids };
  }
  const text =
    e.status === 'added' ? `${who(from)} now ${verb} ${who(to)}` : `${who(from)} no longer ${verb} ${who(to)}`;
  return { op: e.status === 'added' ? 'added' : 'removed', key, text, weight: e.kind === 'read' ? 1 : 3, ids };
}

function nodeChanges(c: NodeChange, edges: EdgeChange[]): Change[] {
  const node = c.node;
  const key = (aspect: string) => `${aspect}|${c.id}`;
  const out: Change[] = [];

  // A function that is new or gone shows through the calls to it, like a reply to a new call
  // in a sequence diagram. Only one nothing calls needs its own line.
  if (c.class === 'added' || c.class === 'removed') {
    const reached = edges.some((e) => e.to === c.id && e.status === c.class);
    if (!reached) {
      const text = c.class === 'added' ? `New: ${who(node)}` : `Removed: ${who(node)}`;
      out.push({ op: c.class, key: key(c.class), text, weight: 3, ids: [c.id] });
    }
    return out;
  }

  if (c.renamedFrom) {
    const text = `${who(node)} was ${code(c.base?.name ?? c.renamedFrom)}`;
    out.push({ op: 'changed', key: key('renamed'), text, weight: 3, ids: [c.id] });
  }
  if (c.signature) {
    const text = `${who(node)} takes or returns something else: ${code(c.signature.head)} instead of ${code(c.signature.base)}`;
    out.push({ op: 'changed', key: key('signature'), text, weight: 3, ids: [c.id] });
  }
  const state = (verb: string, keys: string[], aspect: string, weight: number) => {
    if (keys.length)
      out.push({
        op: 'changed',
        key: key(aspect),
        text: `${who(node)} ${verb} ${keys.map((k) => code(own(node, k))).join(', ')}`,
        weight,
        ids: [c.id],
      });
  };
  state('now also updates', c.writes?.added ?? [], 'writes+', 2);
  state('no longer updates', c.writes?.removed ?? [], 'writes-', 2);
  state('now also reads', c.reads?.added ?? [], 'reads+', 1);
  state('no longer reads', c.reads?.removed ?? [], 'reads-', 1);
  if (c.class === 'implementation') {
    out.push({
      op: 'changed',
      key: key('body'),
      text: `${who(node)} changed, but not what it calls or the state it uses`,
      weight: 1,
      ids: [c.id],
    });
  }
  return out;
}

/** `**MealPlanStore** \`makeGroceryList()\``: the owner in bold, the member as code. */
export function who(node: GraphNode): string {
  if (node.kind === 'template-render') return `**${node.group}** template`;
  if (node.kind === 'template-handler') {
    const [, tag, event] = node.name.match(/ (.*)\((.*)\)$/) ?? [];
    return `**${node.group}** ${code(`(${event})`)} on ${code(`<${tag}>`)}`;
  }
  // Boundary names carry their owner (`GroceryApi.lists`); feature names their group's.
  const dot =
    node.kind === 'boundary'
      ? node.name.lastIndexOf('.')
      : node.name.startsWith(`${node.group}.`)
        ? node.group.length
        : -1;
  const owner = dot < 0 ? node.group : node.name.slice(0, dot);
  const member = dot < 0 ? node.name : node.name.slice(dot + 1);
  const suffix = node.via === 'token' ? ' (token)' : node.via === 'abstract' ? ' (abstract)' : '';
  // Store helpers are already written `(revalidate)`.
  return `**${owner}**${suffix} ${code(member.startsWith('(') ? member : `${member}()`)}`;
}

/** State keys of the node's own store read better without the store's name. */
function own(node: GraphNode, key: string): string {
  return key.startsWith(`${node.group}.`) ? key.slice(node.group.length + 1) : key;
}

/** Inline code that survives backticks in the value. */
export function code(text: string): string {
  const clipped = text.length > 80 ? `${text.slice(0, 79)}…` : text;
  return `\`${clipped.replace(/`/g, "'").replace(/\n/g, ' ⏎ ')}\``;
}
