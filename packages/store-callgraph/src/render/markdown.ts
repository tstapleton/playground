import { type Change, DIFF_MARKS } from '../diff/describe';
import { countsText, type DiffSummary, dependenciesText, type Section } from '../diff/sections';
import { mermaid } from './mermaid';

/** GitHub caps comments at 65,536 characters; leave room for the footer. */
const COMMENT_LIMIT = 60_000;

export interface DiffLabels {
  base: string;
  head: string;
  /** Link to the full HTML report, e.g. a workflow artifact. */
  reportUrl?: string;
}

export interface CommentOptions {
  /** Diagrams with more nodes than this are left to the report. */
  inlineLimit: number;
}

export const DEFAULT_COMMENT: CommentOptions = { inlineLimit: 25 };

export const LEGEND = `${DIFF_MARKS.added} added · ${DIFF_MARKS.removed} removed · ${DIFF_MARKS.changed} changed · ${DIFF_MARKS.moved} moved to a different point`;

/**
 * A pull-request comment: what changed in words, a table of the store methods it
 * touches, then for each a Mermaid diff diagram (GitHub renders these) and its changes.
 */
export function diffComment(
  feature: string,
  summary: DiffSummary,
  labels: DiffLabels,
  options: CommentOptions = DEFAULT_COMMENT,
): string {
  const { sections, changes, unchanged, storeMethods } = summary;
  const total = storeMethods.changed + storeMethods.added + storeMethods.removed + storeMethods.unchanged;
  const counts = (['changed', 'added', 'removed', 'unchanged'] as const)
    .map((s) => `${storeMethods[s]} ${s}`)
    .join(', ');
  const others = sections.filter((s) => !s.entry).length;
  const head: string[] = [
    '## Call graph diff',
    '',
    `\`${labels.base}\` → \`${labels.head}\` · \`${feature}\` · **${total} store method${total === 1 ? '' : 's'}**: ${counts}${others ? ` · ${others} change${others === 1 ? '' : 's'} outside them` : ''}`,
    '',
    `<sub>Each diagram is a store method and the code it can reach, read from the source on both sides. ${LEGEND}. Code outside the feature is shown but not followed.</sub>`,
    '',
    ...whatChanged(changes, sections),
    ...(sections.length
      ? [
          '| Diagram | | Changes | Dependencies outside the feature |',
          '|---|---|---|---|',
          ...sections.map(
            (s) => `| ${cell(s.title)} | ${s.status} | ${countsText(s)} | ${cell(dependenciesText(s))} |`,
          ),
          '',
        ]
      : ['No function, call or dependency changed.', '']),
    ...(unchanged.length
      ? [
          `<details><summary>${unchanged.length} unchanged store method${unchanged.length > 1 ? 's' : ''}</summary>`,
          '',
          ...unchanged.map((u) => `- ${u}`),
          '',
          '</details>',
          '',
        ]
      : []),
  ];
  if (labels.reportUrl)
    head.push(
      `[Open the full report](${labels.reportUrl}) for every diagram rendered, with before and after side by side.`,
      '',
    );

  const out = [...head];
  let omitted = 0;
  for (const s of sections) {
    const text = section(s, options, labels);
    if (out.join('\n').length + text.length > COMMENT_LIMIT) omitted++;
    else out.push(text);
  }
  if (omitted)
    out.push(
      `_${omitted} more diagram${omitted > 1 ? 's' : ''} left out to fit GitHub's comment size limit; see the full report._`,
      '',
    );
  return out.join('\n');
}

function section(s: Section, options: CommentOptions, labels: DiffLabels): string {
  const title = s.status === 'added' ? 'New store method' : s.status === 'removed' ? 'Removed store method' : 'Changed';
  const meta = [`\`${s.file}\``, countsText(s)];
  if (s.dependencies.added.length) meta.push(`new dependency: **${s.dependencies.added.join(', ')}**`);
  if (s.dependencies.removed.length) meta.push(`no longer calls: **${s.dependencies.removed.join(', ')}**`);
  const shown = s.changes.slice(0, 8);
  const nodes = s.diagram.nodes.length;
  const kind = s.status === 'changed' ? 'diff' : 'graph';
  const diagram =
    nodes <= options.inlineLimit
      ? [
          `<details${s.status === 'changed' ? ' open' : ''}><summary>Call graph ${kind}</summary>`,
          '',
          '```mermaid',
          mermaid(s.diagram).trimEnd(),
          '```',
          '',
          '</details>',
        ]
      : [
          `_The diagram has ${nodes} nodes, too many to show here; ${labels.reportUrl ? `see the [full report](${labels.reportUrl})` : 'see the full report'}._`,
        ];
  return [
    `### ${title}: ${s.title}`,
    '',
    meta.join(' · '),
    '',
    ...(s.changes.length
      ? [
          ...shown.map((c) => `- ${DIFF_MARKS[c.op]} ${c.text}`),
          ...(s.changes.length > shown.length
            ? [`- … and ${s.changes.length - shown.length} more in the diagram`]
            : []),
          '',
        ]
      : []),
    ...diagram,
    '',
  ].join('\n');
}

/** Every change once, at the top, with the diagrams that show it. */
function whatChanged(changes: Change[], sections: Section[]): string[] {
  if (!changes.length) return [];
  const shown = changes.slice(0, 12);
  const where = (c: Change) => {
    const shownIn = sections.filter((s) => s.changes.some((x) => x.key === c.key));
    return shownIn.length > 1
      ? ` · in ${shownIn.length} diagrams`
      : shownIn.length === 1
        ? ` · in ${shownIn[0].title}`
        : '';
  };
  return [
    '#### What changed',
    '',
    ...shown.map((c) => `- ${DIFF_MARKS[c.op]} ${c.text}${where(c)}`),
    ...(changes.length > shown.length ? [`- … and ${changes.length - shown.length} more`] : []),
    '',
  ];
}

function cell(text: string): string {
  return text.replace(/\|/g, '\\|');
}
