import type { CallSite, GraphNode } from '../graph/model';

/** The node's name inside its diagram group: `load` rather than `DynamicFormStore.load`. */
export function shortName(node: GraphNode): string {
  if (node.kind === 'template-render') return 'template';
  if (node.kind === 'template-handler') {
    const [, tag, event] = node.name.match(/ (.*)\((.*)\)$/) ?? [];
    return tag ? `(${event}) on ${tag}` : node.name;
  }
  if (node.kind === 'boundary')
    return node.via === 'token' || node.via === 'abstract' ? `${node.name} (${node.via})` : node.name;
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
