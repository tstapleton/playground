import { mergeRepeatedGestures } from './merge';
import { describeChange, TraceEvent } from './model';

/** Renders recorded events as a Mermaid sequence diagram. */
export function toSequenceDiagram(events: TraceEvent[], uiName: string): string {
  const merged = mergeRepeatedGestures(events);

  const names: string[] = [];
  const add = (name: string) => !names.includes(name) && names.push(name);
  add(uiName);
  for (const e of merged) {
    if (e.kind === 'note') add(e.over);
    else if (e.kind !== 'user') {
      add(e.from);
      add(e.to);
    }
  }
  const id = (name: string) => `P${names.indexOf(name)}`;

  const lines = ['sequenceDiagram', '  autonumber'];
  if (merged.some((e) => e.kind === 'user')) lines.push('  actor U as User');
  for (const name of names) lines.push(`  participant ${id(name)} as ${escape(name)}`);

  for (const e of merged) {
    switch (e.kind) {
      case 'user':
        lines.push(`  U->>${id(e.to)}: ${escape(e.text)}`);
        break;
      case 'call':
        lines.push(`  ${id(e.from)}->>${id(e.to)}: ${escape(e.label)}`);
        break;
      case 'return':
        lines.push(`  ${id(e.from)}-->>${id(e.to)}: ${escape(e.label)}`);
        break;
      case 'throw':
        lines.push(`  ${id(e.from)}--x${id(e.to)}: ${escape(e.label)}`);
        break;
      case 'note': {
        const shown = e.changes.slice(0, 5).map((c) => escape(describeChange(c)));
        if (e.changes.length > 5) shown.push(`…${e.changes.length - 5} more`);
        lines.push(`  Note over ${id(e.over)}: ${shown.join('<br/>')}`);
        break;
      }
    }
  }
  return lines.join('\n');
}

/** Mermaid treats `;` and `#` specially and `<`/`>` as HTML. */
export function escape(text: string): string {
  return text.replace(/[#;<>]/g, (c) => ({ '#': '#35;', ';': '#59;', '<': '#lt;', '>': '#gt;' })[c]!);
}
