import { ChangeClass, EdgeChange, NodeChange } from '../diff/diff';
import { CallSite, GraphNode } from '../graph/model';

/** The node's name inside its diagram group: `load` rather than `DynamicFormStore.load`. */
export function shortName(node: GraphNode): string {
  if (node.kind === 'template-render') return 'template';
  if (node.kind === 'template-handler') {
    const [, tag, event] = node.name.match(/ (.*)\((.*)\)$/) ?? [];
    return tag ? `(${event}) on ${tag}` : node.name;
  }
  if (node.kind === 'boundary') return node.via === 'token' || node.via === 'abstract' ? `${node.name} (${node.via})` : node.name;
  return node.name.startsWith(`${node.group}.`) ? node.name.slice(node.group.length + 1) : node.name;
}

/** The full name, for lists outside a diagram. */
export function fullName(node: GraphNode): string {
  if (node.kind === 'template-render') return `${node.group} template`;
  if (node.kind === 'template-handler') return `${node.group} ${shortName(node)}`;
  return node.kind === 'boundary' ? shortName(node) : node.name;
}

/** `switchMap › tap, then retry › catchError, if` */
export function siteText(site: CallSite): string {
  const parts: string[] = [];
  if (site.within.length) parts.push(site.within.join(' › '));
  if (site.piped.length) parts.push(`piped ${site.piped.join(' › ')}`);
  if (site.branch.length) parts.push(site.branch.join(' › '));
  return parts.join(', ');
}

export function sitesText(sites: CallSite[]): string {
  const texts = sites.map(siteText);
  return texts.every((t) => !t) ? 'direct' : texts.map((t) => t || 'direct').join('; ');
}

export const CLASS_LABEL: Record<ChangeClass, string> = {
  added: 'added',
  removed: 'removed',
  structural: 'calls changed',
  context: 'call context changed',
  state: 'state access changed',
  implementation: 'body changed',
  renamed: 'renamed',
  unchanged: 'unchanged',
};

/** The label for a change's class; a boundary whose signature alone changed says so. */
export function classLabel(change: NodeChange): string {
  return change.class === 'structural' && change.signature && !change.calls ? 'signature changed' : CLASS_LABEL[change.class];
}

/** One line per aspect of a change, using `nameOf` for node IDs. */
export function describe(change: NodeChange, nameOf: (id: string) => string, edges: EdgeChange[]): string[] {
  const node = (change.head ?? change.base)!;
  // State of the node's own store reads better without the store's name.
  const state = (keys: string[]) => keys.map((k) => (k.startsWith(`${node.group}.`) ? k.slice(node.group.length + 1) : k)).join(', ');
  const list = (ids: string[]) => [...new Set(ids)].map(nameOf).join(', ');
  const lines: string[] = [];

  if (change.class === 'added' || change.class === 'removed') {
    const live = edges.filter((e) => e.status !== (change.class === 'added' ? 'removed' : 'added'));
    const callers = live.filter((e) => e.to === change.id).map((e) => e.from);
    const callees = live.filter((e) => e.from === change.id).map((e) => e.to);
    const was = change.class === 'removed' ? 'was ' : '';
    if (callers.length) lines.push(`${was}called by ${list(callers)}`);
    if (callees.length) lines.push(`${change.class === 'removed' ? 'called' : 'calls'} ${list(callees)}`);
    if (node.writes.length) lines.push(`${change.class === 'removed' ? 'wrote' : 'writes'} ${node.writes.join(', ')}`);
    return lines;
  }

  if (change.renamedFrom) lines.push(`renamed from ${nameOf(change.renamedFrom)}`);
  if (change.signature) lines.push(`signature: ${change.signature.base} → ${change.signature.head}`);
  if (change.calls?.added.length) lines.push(`now calls ${list(change.calls.added)}`);
  if (change.calls?.removed.length) lines.push(`no longer calls ${list(change.calls.removed)}`);
  for (const e of edges.filter((e) => e.from === change.id && e.status === 'context')) {
    lines.push(`calls ${nameOf(e.to)} from a different place: was ${sitesText(e.base!.sites)}, now ${sitesText(e.head!.sites)}`);
  }
  if (change.writes?.added.length) lines.push(`now writes ${state(change.writes.added)}`);
  if (change.writes?.removed.length) lines.push(`no longer writes ${state(change.writes.removed)}`);
  if (change.reads?.added.length) lines.push(`now reads ${state(change.reads.added)}`);
  if (change.reads?.removed.length) lines.push(`no longer reads ${state(change.reads.removed)}`);
  if (node.kind === 'boundary' && change.signature) {
    const callers = edges.filter((e) => e.to === change.id && e.status !== 'removed').map((e) => e.from);
    if (callers.length) lines.push(`called by ${list(callers)}`);
  }
  if (change.implementation && lines.length === 0) lines.push('body changed; calls and state access did not');
  return lines;
}
