import path from 'node:path';
import { Checkout, checkout, gitRoot } from './checkout/checkout';
import { diffGraphs, GraphDiff } from './diff/diff';
import { extract, ExtractOptions, ExtractResult } from './extract/extract';
import { Graph } from './graph/model';
import { DEFAULT_SLICE, SliceOptions, View, diffView, entryIds, graphView, slicePerEntry, slicePerSeed } from './graph/slice';

/** Where to read a side from: a directory as it is on disk, or a git revision. */
export type Source = { dir: string } | { rev: string; repo?: string; install?: string };

export interface AnalyzeOptions extends Omit<ExtractOptions, 'tsconfig' | 'revision' | 'root'> {
  /** Relative to the source's directory (for a revision: the repository root). */
  tsconfig: string;
}

/** Builds the graph of one side, checking the revision out first if needed. */
export function graphOf(source: Source, options: AnalyzeOptions): ExtractResult {
  if ('dir' in source) return extract({ ...options, tsconfig: path.resolve(source.dir, options.tsconfig) });
  const repo = gitRoot(source.repo ?? process.cwd());
  let co: Checkout | undefined;
  try {
    co = checkout(repo, source.rev, source.install);
    const result = extract({ ...options, tsconfig: path.join(co.dir, options.tsconfig), revision: co.sha });
    return { graph: result.graph, warnings: [...co.warnings, ...result.warnings] };
  } finally {
    co?.dispose();
  }
}

/** One diagram per store method (optionally filtered by a `*` pattern on its name). */
export function graphDiagrams(graph: Graph, entry?: string, options: SliceOptions = { ...DEFAULT_SLICE, depth: 3 }): View[] {
  const view = graphView(graph);
  return slicePerSeed(view, entryIds(view, entry), options);
}

/** One diagram per changed store method, then one per remaining group of changes. */
export function diffDiagrams(diff: GraphDiff, options: SliceOptions = DEFAULT_SLICE): View[] {
  return slicePerEntry(diffView(diff), options);
}

export { diffGraphs };
