import { ChangeClass, GraphDiff, NodeChange } from '../diff/diff';
import { compare } from '../graph/model';
import { View } from '../graph/slice';
import { classLabel, describe, fullName } from './labels';
import { mermaid } from './mermaid';

export interface Labels {
  base: string;
  head: string;
  /** Link to the HTML report, for diagrams too large to inline. */
  reportUrl?: string;
}

export interface CommentOptions {
  /** Diagrams with more nodes than this are left out of the comment. */
  inlineLimit: number;
  /** GitHub rejects comments over 65,536 characters. */
  maxLength: number;
}

export const DEFAULT_COMMENT: CommentOptions = { inlineLimit: 25, maxLength: 65_000 };

const ORDER: ChangeClass[] = ['structural', 'added', 'removed', 'context', 'state', 'implementation', 'renamed'];

const LEGEND =
  '<sub>Green: added · red, dashed: removed · amber: calls changed (dashed: same calls, different place) · blue: state access changed · ' +
  'thick outline: body changed only. Solid arrows are calls, dotted arrows are reads, thick arrows are outputs reaching a parent template.</sub>';

/** A pull-request comment: a summary, every change as a table row, and small diagrams inline. */
export function diffComment(diff: GraphDiff, views: View[], labels: Labels, options: CommentOptions = DEFAULT_COMMENT): string {
  const changes = significant(diff);
  const nameOf = nameLookup(diff);
  const head: string[] = [`## Call graph changes in \`${diff.head.feature}\``, '', `\`${labels.base}\` → \`${labels.head}\` · ${summary(changes)}`, ''];
  if (changes.length === 0) return [...head, 'No method, call or dependency changed.', ''].join('\n');

  const table = ['| Change | Where | What |', '|---|---|---|'];
  for (const c of changes) {
    const node = (c.head ?? c.base)!;
    const where = node.kind === 'boundary' ? `\`${fullName(node)}\` (outside)` : `\`${fullName(node)}\``;
    const what = describe(c, nameOf, diff.edges).join('; ') || '—';
    table.push(`| ${classLabel(c)} | ${cell(where)} | ${cell(what)} |`);
  }

  const diagrams = views.map((v) => ({
    view: v,
    inline: v.nodes.length <= options.inlineLimit,
    text: ['```mermaid', mermaid(v).trimEnd(), '```'].join('\n'),
  }));
  const render = () => {
    const sections = diagrams.map(({ view, inline, text }) => {
      const title = `### ${view.title}`;
      if (inline) return [title, '', text, ''].join('\n');
      const where = labels.reportUrl ? `see the [report](${labels.reportUrl})` : 'see the HTML report';
      return [title, '', `_${view.nodes.length} nodes, too many to show here; ${where}._`, ''].join('\n');
    });
    return [...head, LEGEND, '', ...table, '', ...sections].join('\n');
  };

  // Over the size limit: leave out the largest inline diagrams until it fits.
  let out = render();
  const bySize = [...diagrams].sort((a, b) => b.text.length - a.text.length || compare(a.view.title, b.view.title));
  for (const d of bySize) {
    if (out.length <= options.maxLength) break;
    if (d.inline) {
      d.inline = false;
      out = render();
    }
  }
  return out;
}

/** Changes worth listing, most significant first. */
export function significant(diff: GraphDiff): NodeChange[] {
  return diff.nodes
    .filter((c) => c.class !== 'unchanged')
    .sort((a, b) => ORDER.indexOf(a.class) - ORDER.indexOf(b.class) || compare(fullName((a.head ?? a.base)!), fullName((b.head ?? b.base)!)));
}

export function summary(changes: NodeChange[]): string {
  const inside = changes.filter((c) => (c.head ?? c.base)!.kind !== 'boundary');
  const outside = changes.filter((c) => (c.head ?? c.base)!.kind === 'boundary');
  const count = (list: NodeChange[], cls: ChangeClass) => list.filter((c) => c.class === cls).length;
  const changed = inside.length - count(inside, 'added') - count(inside, 'removed');
  const parts = [`**${changed}** changed, **${count(inside, 'added')}** added, **${count(inside, 'removed')}** removed in the feature`];
  if (outside.length) {
    const deps = [`+${count(outside, 'added')}`, `−${count(outside, 'removed')}`];
    const signatures = outside.filter((c) => c.signature).length;
    parts.push(`dependencies outside it: **${deps.join(' ')}**${signatures ? `, **${signatures}** with a changed signature` : ''}`);
  }
  return parts.join(' · ');
}

function cell(text: string): string {
  return text.replace(/\|/g, '\\|').replace(/\n/g, ' ');
}

export function nameLookup(diff: GraphDiff): (id: string) => string {
  const names = new Map(diff.nodes.map((c) => [c.id, fullName((c.head ?? c.base)!)]));
  for (const c of diff.nodes) if (c.renamedFrom && c.base) names.set(c.renamedFrom, fullName(c.base));
  return (id) => names.get(id) ?? id;
}
