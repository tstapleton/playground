import { compare, type Graph, KIND_ORDER } from '../graph/model';
import {
  DEFAULT_SLICE,
  diffView,
  entryIds,
  graphView,
  mainNode,
  nodeIn,
  type SliceOptions,
  slicePerEntry,
  slicePerSeed,
  type View,
} from '../graph/slice';
import { fullName } from '../render/labels';
import { type Change, changesIn, DIFF_MARKS, describeDiff } from './describe';
import type { GraphDiff } from './diff';

export type SectionStatus = 'changed' | 'added' | 'removed';

/** One diagram of a diff and what it shows. */
export interface Section {
  title: string;
  /** The store method the diagram starts from; absent for changes no store method reaches. */
  entry?: string;
  status: SectionStatus;
  /** Path of the entry point's file, or of the first changed node. */
  file: string;
  /** What to draw: the diff, or for a store method that is new or gone, its plain graph. */
  diagram: View;
  /** The store method's own graph on each side, for side-by-side viewing. */
  before?: View;
  after?: View;
  counts: { added: number; removed: number; changed: number; moved: number };
  dependencies: { added: string[]; removed: string[] };
  changes: Change[];
}

export interface DiffSummary {
  sections: Section[];
  /** Store methods by how their diagrams changed, including those that didn't. */
  storeMethods: Record<SectionStatus | 'unchanged', number>;
  /** Every change once, most important first. */
  changes: Change[];
  /** Store methods whose diagrams didn't change. */
  unchanged: string[];
}

/** The diff as review sections: changed store methods first, biggest first. */
export function summarize(
  base: Graph,
  head: Graph,
  diff: GraphDiff,
  options: SliceOptions = DEFAULT_SLICE,
): DiffSummary {
  const view = diffView(diff);
  const changes = describeDiff(diff);
  const sideOptions = { ...options, depth: options.depth + 1 };
  const side = (graph: Graph, id: string | undefined) => {
    if (!id) return undefined;
    const g = graphView(graph);
    return g.nodes.some((n) => n.id === id) ? slicePerSeed(g, [id], sideOptions)[0] : undefined;
  };

  const sections = slicePerEntry(view, options).map((v): Section => {
    const entry = v.entry ? view.nodes.find((n) => n.id === v.entry) : undefined;
    const status: SectionStatus =
      entry?.status === 'added' ? 'added' : entry?.status === 'removed' ? 'removed' : 'changed';
    const baseId = entry?.change?.renamedFrom ?? entry?.id;
    const before = side(base, baseId);
    const after = side(head, entry?.id);
    const ids = new Set(v.nodes.map((n) => n.id));
    const boundary = (s: string) =>
      v.nodes.filter((n) => n.node.kind === 'boundary' && n.status === s).map((n) => fullName(n.node));
    return {
      title: v.title,
      entry: v.entry,
      status,
      file: mainNode(v).node.file,
      // A new or deleted store method reads better as a plain graph than as all + or all −.
      diagram: (status === 'added' ? after : status === 'removed' ? before : undefined) ?? v,
      before,
      after,
      counts: {
        added: v.edges.filter((e) => e.status === 'added').length,
        removed: v.edges.filter((e) => e.status === 'removed').length,
        changed: v.nodes.filter((n) => n.status !== 'unchanged' && n.status !== 'added' && n.status !== 'removed')
          .length,
        moved: v.edges.filter((e) => e.status === 'context').length,
      },
      dependencies: { added: boundary('added'), removed: boundary('removed') },
      changes: changesIn(changes, ids),
    };
  });

  const shown = new Set(sections.map((s) => s.title));
  const unchanged = entryIds(view)
    .map((id) => fullName(nodeIn(view, id).node))
    .filter((name) => !shown.has(name));
  const withEntry = sections.filter((s) => s.entry);
  const storeMethods = {
    changed: withEntry.filter((s) => s.status === 'changed').length,
    added: withEntry.filter((s) => s.status === 'added').length,
    removed: withEntry.filter((s) => s.status === 'removed').length,
    unchanged: unchanged.length,
  };
  const ordered = reviewOrder(sections);
  const read = readingOrder(changes, ordered, view);
  for (const section of ordered) section.changes = read.filter((c) => section.changes.includes(c));
  return { sections: ordered, storeMethods, changes: read, unchanged };
}

/**
 * Most important first; then the most widespread; then in the order of the diagrams, the
 * store's API before its helpers.
 */
function readingOrder(changes: Change[], sections: Section[], view: View): Change[] {
  const spread = (c: Change) => sections.filter((s) => s.changes.some((x) => x.key === c.key)).length;
  const firstDiagram = (c: Change) => {
    const i = sections.findIndex((s) => s.changes.some((x) => x.key === c.key));
    return i < 0 ? sections.length : i;
  };
  const rank = (c: Change) => KIND_ORDER.indexOf(nodeIn(view, c.ids[0]).node.kind);
  return [...changes].sort(
    (a, b) =>
      b.weight - a.weight ||
      spread(b) - spread(a) ||
      firstDiagram(a) - firstDiagram(b) ||
      rank(a) - rank(b) ||
      compare(a.key, b.key),
  );
}

/** Changed sections first (biggest first), then added, then removed. */
function reviewOrder(sections: Section[]): Section[] {
  const rank: Record<SectionStatus, number> = { changed: 0, added: 1, removed: 2 };
  const size = (s: Section) => s.counts.added + s.counts.removed + s.counts.changed + s.counts.moved;
  return [...sections].sort(
    (a, b) =>
      rank[a.status] - rank[b.status] || size(b) - size(a) || (a.title < b.title ? -1 : a.title > b.title ? 1 : 0),
  );
}

/** e.g. `+2 −1 Δ3 ↕1`. */
export function countsText(s: Section): string {
  if (s.status !== 'changed') return `${s.diagram.nodes.length} functions`;
  const parts: string[] = [];
  if (s.counts.added) parts.push(`${DIFF_MARKS.added}${s.counts.added}`);
  if (s.counts.removed) parts.push(`${DIFF_MARKS.removed}${s.counts.removed}`);
  if (s.counts.changed) parts.push(`${DIFF_MARKS.changed}${s.counts.changed}`);
  if (s.counts.moved) parts.push(`${DIFF_MARKS.moved}${s.counts.moved}`);
  return parts.join(' ');
}

export function dependenciesText(s: Section): string {
  return [...s.dependencies.added.map((d) => `+ ${d}`), ...s.dependencies.removed.map((d) => `− ${d}`)].join(', ');
}
