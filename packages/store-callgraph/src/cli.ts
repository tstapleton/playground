import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { graphDiagrams, graphOf, type Source } from './api';
import { diffGraphs } from './diff/diff';
import { summarize } from './diff/sections';
import { DEFAULT_HIDE } from './extract/resolve';
import { serialize } from './graph/canonical';
import { DEFAULT_SLICE } from './graph/slice';
import { diffPage, graphPage } from './render/html';
import { DEFAULT_COMMENT, diffComment } from './render/markdown';
import { mermaid } from './render/mermaid';

const USAGE = `Usage:
  store-callgraph graph --feature <dir> [--rev <rev> | --dir <dir>] [--entry <pattern>] [--out <dir>]
      One diagram per store method. Writes graph.json, diagrams.md and index.html.

  store-callgraph diff --feature <dir> (--base <rev> | --base-dir <dir>) [--head <rev> | --head-dir <dir>] [--out <dir>]
                       [--base-label <text>] [--head-label <text>] [--report-url <url>] [--install <command>]
      What changed between two revisions. Writes base.json, head.json, diff.json, comment.md and index.html.
      Without --head or --head-dir, the head is the working tree.

Options for both:
  --tsconfig <path>      The app's tsconfig, relative to the checkout (default: tsconfig.app.json)
  --feature <dir>        The feature directory, relative to the tsconfig's directory
  --depth <n>            Calls to follow below an entry point or change (graph: 3, diff: 1)
  --up <n>               Callers to show above an entry point (default: 1)
  --budget <n>           Most nodes per diagram (default: 40)
  --inline-limit <n>     diff: diagrams with more nodes stay out of comment.md (default: 25)
  --hide <a,b>           Boundary ID prefixes to leave out (default: ${DEFAULT_HIDE.join(',')})

Defaults for any option can be set in store-callgraph.config.json in the current directory.`;

type Flags = Record<string, string | undefined>;

function main(argv: string[]): number {
  const [command, ...rest] = argv;
  const flags: Flags = { ...readConfig() };
  for (let i = 0; i < rest.length; i++) {
    if (!rest[i].startsWith('--')) return usage(`Unexpected argument ${rest[i]}`);
    flags[rest[i].slice(2)] = rest[i + 1];
    i++;
  }
  if (!flags.feature) return usage('--feature is required');
  const analyze = {
    tsconfig: flags.tsconfig ?? 'tsconfig.app.json',
    feature: flags.feature,
    hide: flags.hide ? flags.hide.split(',').filter(Boolean) : undefined,
  };
  const number = (name: string, fallback: number) => (flags[name] !== undefined ? Number(flags[name]) : fallback);

  if (command === 'graph') {
    const source: Source = flags.rev ? { rev: flags.rev, install: flags.install } : { dir: flags.dir ?? '.' };
    const { graph, warnings } = graphOf(source, analyze);
    for (const w of warnings) console.warn(`warning: ${w}`);
    const views = graphDiagrams(graph, flags.entry, {
      depth: number('depth', 3),
      up: number('up', DEFAULT_SLICE.up),
      budget: number('budget', DEFAULT_SLICE.budget),
    });
    const label = flags.rev ?? flags.dir ?? 'working tree';
    const out = path.resolve(flags.out ?? 'callgraph');
    mkdirSync(out, { recursive: true });
    writeFileSync(path.join(out, 'graph.json'), serialize(graph));
    writeFileSync(
      path.join(out, 'diagrams.md'),
      views.map((v) => `## ${v.title}\n\n\`\`\`mermaid\n${mermaid(v)}\`\`\`\n`).join('\n'),
    );
    writeFileSync(path.join(out, 'index.html'), graphPage(graph, views, label));
    console.log(
      `${graph.nodes.length} nodes, ${graph.edges.length} edges, ${views.length} diagrams. Wrote ${path.relative(process.cwd(), out) || '.'}/`,
    );
    return 0;
  }

  if (command === 'diff') {
    const base: Source | undefined = flags.base
      ? { rev: flags.base, install: flags.install }
      : flags['base-dir']
        ? { dir: flags['base-dir'] }
        : undefined;
    if (!base) return usage('--base or --base-dir is required');
    const head: Source = flags.head ? { rev: flags.head, install: flags.install } : { dir: flags['head-dir'] ?? '.' };
    const baseResult = graphOf(base, analyze);
    const headResult = graphOf(head, analyze);
    for (const w of [...baseResult.warnings, ...headResult.warnings]) console.warn(`warning: ${w}`);

    const diff = diffGraphs(baseResult.graph, headResult.graph);
    const summary = summarize(baseResult.graph, headResult.graph, diff, {
      depth: number('depth', DEFAULT_SLICE.depth),
      up: number('up', DEFAULT_SLICE.up),
      budget: number('budget', DEFAULT_SLICE.budget),
    });
    const labels = {
      base: flags['base-label'] ?? flags.base ?? flags['base-dir'] ?? 'base',
      head: flags['head-label'] ?? flags.head ?? flags['head-dir'] ?? 'working tree',
      reportUrl: flags['report-url'],
    };
    const out = path.resolve(flags.out ?? 'callgraph-diff');
    mkdirSync(out, { recursive: true });
    writeFileSync(path.join(out, 'base.json'), serialize(baseResult.graph));
    writeFileSync(path.join(out, 'head.json'), serialize(headResult.graph));
    writeFileSync(path.join(out, 'diff.json'), `${JSON.stringify(diff, null, 2)}\n`);
    const feature = diff.head.feature;
    writeFileSync(
      path.join(out, 'comment.md'),
      diffComment(feature, summary, labels, { inlineLimit: number('inline-limit', DEFAULT_COMMENT.inlineLimit) }),
    );
    writeFileSync(path.join(out, 'index.html'), diffPage(feature, summary, labels, diff.head.analyzer));
    // The count comes first, for scripts that read it.
    console.log(
      `${summary.changes.length} changes in ${summary.sections.length} diagrams. Wrote ${path.relative(process.cwd(), out) || '.'}/`,
    );
    return 0;
  }

  return usage();
}

function readConfig(): Flags {
  const file = path.resolve('store-callgraph.config.json');
  if (!existsSync(file)) return {};
  const config = JSON.parse(readFileSync(file, 'utf8')) as Record<string, unknown>;
  return Object.fromEntries(Object.entries(config).map(([k, v]) => [k, Array.isArray(v) ? v.join(',') : String(v)]));
}

function usage(error?: string): number {
  if (error) console.error(`error: ${error}\n`);
  console.error(USAGE);
  return 1;
}

process.exitCode = main(process.argv.slice(2));
