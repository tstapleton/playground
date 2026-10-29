/** Bumped whenever extraction or the JSON shape changes, so cached graphs are not reused. */
export const GRAPH_VERSION = 1;

export type NodeKind =
  /** A property of the object `withMethods` returns: the store's public API. */
  | 'store-method'
  /** A local function inside a `withMethods` factory, e.g. `const revalidate = () => …`. */
  | 'store-helper'
  /** A property of the object `withComputed` returns. */
  | 'store-computed'
  /** `onInit` / `onDestroy` from `withHooks`. */
  | 'store-hook'
  /** A method of a component, directive or other class in the feature. */
  | 'class-method'
  /** A class field whose value is a function, `computed()` or `effect()`. */
  | 'class-field'
  /** All event bindings with the same event on the same tag in one template. */
  | 'template-handler'
  /** Property bindings, interpolations and control flow of one template. */
  | 'template-render'
  /** A top-level function in the feature. */
  | 'function'
  /** Something outside the feature that the feature calls. Never expanded. */
  | 'boundary'
  /** A call the checker could not resolve, e.g. through an untyped parameter. */
  | 'unresolved';

export type EdgeKind =
  /** A direct call. */
  | 'call'
  /** Reading a computed or calling a method from a template binding. */
  | 'read'
  /** `output.emit()` reaching the parent template's handler for that output. */
  | 'emit';

export interface GraphNode {
  /** Stable identity: `<path>#<qualified name>`. Never contains line numbers. */
  id: string;
  kind: NodeKind;
  /** Short label, e.g. `DynamicFormStore.load`. */
  name: string;
  /** Path relative to the project root. */
  file: string;
  /** 1-based, for links only. Not compared when diffing. */
  line: number;
  /** Diagram group: the store, class or file the node belongs to. */
  group: string;
  /** Parameter and return types, as the checker prints them. */
  signature: string;
  /** Hash of the body's tokens without comments or whitespace. Empty for boundary nodes. */
  fingerprint: string;
  /** Store state read, as `Store.key`. */
  reads: string[];
  /** State keys written through `patchState`. */
  writes: string[];
  /** For boundary nodes: reached through an abstract class or an `InjectionToken`. */
  via?: 'abstract' | 'token' | 'interface';
}

/** Where one call sits inside its caller. */
export interface CallSite {
  /** Calls whose callbacks enclose this one, outermost first, e.g. `["switchMap", "tap"]`. */
  within: string[];
  /** Operators piped onto this call's result, e.g. `["retry", "catchError"]`. */
  piped: string[];
  /** Enclosing control flow, outermost first, e.g. `["for", "if"]`. */
  branch: string[];
}

export interface GraphEdge {
  from: string;
  to: string;
  kind: EdgeKind;
  /** One entry per distinct context the call appears in. */
  sites: CallSite[];
}

export interface Graph {
  version: number;
  /** What the graph was built from. Identical inputs give an identical graph. */
  inputs: {
    feature: string;
    revision?: string;
    analyzer: string;
  };
  nodes: GraphNode[];
  edges: GraphEdge[];
}

export function siteKey(site: CallSite): string {
  return [site.within.join('>'), site.piped.join('>'), site.branch.join('>')].join('|');
}

export function edgeKey(edge: Pick<GraphEdge, 'from' | 'to' | 'kind'>): string {
  return `${edge.from} ${edge.kind} ${edge.to}`;
}

/** Code-unit comparison: the same order on every machine and locale. */
export function compare(a: string, b: string): number {
  return a < b ? -1 : a > b ? 1 : 0;
}
