import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { CssSelector, SelectorMatcher, VERSION } from '@angular/compiler';
import ts from 'typescript';
import { canonicalize } from '../graph/canonical';
import { type CallSite, compare, GRAPH_VERSION, type Graph, type GraphEdge, type GraphNode } from '../graph/model';
import { DEFAULT_HIDE, isInside, Resolver } from './resolve';
import { analyzeTemplate, type TemplateInfo } from './templates';
import { siteOf } from './ts-utils';
import { componentTemplate, discoverUnits, posix, type Unit } from './units';

export interface ExtractOptions {
  /** The app's tsconfig, e.g. `tsconfig.app.json`. */
  tsconfig: string;
  /** The feature directory, relative to `root` (or absolute). */
  feature: string;
  /** Paths in the graph are relative to this. Defaults to the tsconfig's directory. */
  root?: string;
  /** Boundary IDs to leave out, as prefixes. Defaults to Angular, NgRx, RxJS and tslib. */
  hide?: string[];
  /** Recorded in the graph's inputs. */
  revision?: string;
}

export interface ExtractResult {
  graph: Graph;
  warnings: string[];
}

/** This package's manifest: next to `dist/`, or two levels above this file when run from source. */
function ownPackage(): { name: string; version: string } {
  for (const relative of ['../package.json', '../../package.json']) {
    const url = new URL(relative, import.meta.url);
    if (existsSync(url)) {
      const manifest = JSON.parse(readFileSync(url, 'utf8'));
      if (manifest.name === 'store-callgraph') return manifest;
    }
  }
  throw new Error('store-callgraph: package.json not found');
}

const PACKAGE = ownPackage();

export const ANALYZER = `${PACKAGE.name}@${PACKAGE.version} typescript@${ts.version} @angular/compiler@${VERSION.full} graph@${GRAPH_VERSION}`;

const NO_SITE: CallSite = { within: [], piped: [], branch: [] };

export function extract(options: ExtractOptions): ExtractResult {
  const tsconfig = path.resolve(options.tsconfig);
  const projectDir = path.resolve(options.root ?? path.dirname(tsconfig));
  const featureDir = path.resolve(projectDir, options.feature);
  const paths = { projectDir, featureDir };
  const warnings: string[] = [];

  const program = createProgram(tsconfig, warnings);
  const checker = program.getTypeChecker();
  const files = program
    .getSourceFiles()
    .filter((sf) => !sf.isDeclarationFile && isInside(featureDir, sf.fileName))
    .sort((a, b) => compare(a.fileName, b.fileName));
  if (files.length === 0)
    throw new Error(`No source files of ${path.relative(process.cwd(), tsconfig)} are inside ${featureDir}`);
  if (!program.getSourceFiles().some((sf) => posix(sf.fileName).includes('/@ngrx/signals/'))) {
    // Without them nothing resolves, and the graph would wrongly say nothing changed.
    throw new Error(
      `@ngrx/signals types were not found from ${path.relative(process.cwd(), tsconfig)}. Are dependencies installed?`,
    );
  }

  const feature = discoverUnits(checker, files, paths);
  const templates: (TemplateInfo & { cls: ts.ClassDeclaration })[] = feature.components.map((component) => ({
    cls: component.cls,
    ...analyzeTemplate(component, paths),
  }));
  for (const t of templates) warnings.push(...t.warnings);
  const resolver = new Resolver(checker, program, paths, feature, { hide: options.hide ?? DEFAULT_HIDE });

  const units = [...feature.units, ...templates.flatMap((t) => t.units)];
  const nodes = new Map<string, GraphNode>();
  for (const unit of units) nodes.set(unit.id, toNode(unit));
  const edges: GraphEdge[] = [];
  const emits: { from: Unit; cls: ts.ClassDeclaration; output: string; site: CallSite }[] = [];

  const record = (
    from: Unit,
    target: ReturnType<Resolver['call']>,
    site: CallSite,
    fromTemplate: 'handler' | 'render' | undefined,
  ) => {
    const node = nodes.get(from.id);
    if (!node) return;
    switch (target.kind) {
      case 'unit':
        if (target.unit.id !== from.id) {
          const read = target.unit.isSignal || fromTemplate === 'render';
          edges.push({ from: from.id, to: target.unit.id, kind: read ? 'read' : 'call', sites: [site] });
        }
        break;
      case 'boundary':
        if (!nodes.has(target.node.id)) nodes.set(target.node.id, target.node);
        edges.push({
          from: from.id,
          to: target.node.id,
          kind: fromTemplate === 'render' ? 'read' : 'call',
          sites: [site],
        });
        break;
      case 'read':
        node.reads.push(target.key);
        break;
      case 'write':
        node.writes.push(...target.keys);
        break;
      case 'emit':
        emits.push({ from, cls: target.cls, output: target.output, site });
        break;
      case 'unresolved': {
        const id = `${from.id}?${target.text}`;
        nodes.set(id, {
          id,
          kind: 'unresolved',
          name: `${target.text}(…)`,
          file: from.file,
          line: from.line,
          group: from.group,
          signature: '',
          fingerprint: '',
          reads: [],
          writes: [],
        });
        edges.push({ from: from.id, to: id, kind: 'call', sites: [site] });
        break;
      }
    }
  };

  // Each unit's calls, without descending into other units declared inside it.
  const roots = new Set(feature.units.map((u) => u.body));
  for (const unit of feature.units) {
    const visit = (n: ts.Node) => {
      if (n !== unit.body && roots.has(n)) return;
      if (ts.isCallExpression(n)) record(unit, resolver.call(n), siteOf(n, unit.body), undefined);
      ts.forEachChild(n, visit);
    };
    visit(unit.body);
  }

  for (const t of templates) {
    for (const call of t.calls) {
      record(
        call.unit,
        resolver.chain(t.cls, call.chain),
        NO_SITE,
        call.unit.kind === 'template-render' ? 'render' : 'handler',
      );
    }
  }

  // `output.emit()` reaches whichever handlers parent templates bind to that output.
  for (const emit of emits) {
    const selector = componentTemplate(emit.cls)?.selector;
    if (!selector) continue;
    const matcher = new SelectorMatcher();
    matcher.addSelectables(CssSelector.parse(selector));
    for (const t of templates) {
      for (const element of t.elements) {
        const handler = element.handlers.get(emit.output);
        if (handler && matcher.match(element.selector, null)) {
          edges.push({ from: emit.from.id, to: handler.id, kind: 'emit', sites: [emit.site] });
        }
      }
    }
  }

  const inputs: Graph['inputs'] = { feature: posix(path.relative(projectDir, featureDir)), analyzer: ANALYZER };
  if (options.revision) inputs.revision = options.revision;
  const graph = canonicalize({ version: GRAPH_VERSION, inputs, nodes: [...nodes.values()], edges });
  return { graph, warnings: [...new Set(warnings)].sort(compare) };
}

function createProgram(tsconfig: string, warnings: string[]): ts.Program {
  const host: ts.ParseConfigFileHost = {
    ...ts.sys,
    onUnRecoverableConfigFileDiagnostic: (d) => {
      throw new Error(ts.flattenDiagnosticMessageText(d.messageText, '\n'));
    },
  };
  const config = ts.getParsedCommandLineOfConfigFile(tsconfig, {}, host);
  if (!config) throw new Error(`Could not read ${tsconfig}`);
  for (const d of config.errors) warnings.push(ts.flattenDiagnosticMessageText(d.messageText, ' '));
  // Root order doesn't change the result, but sorting removes any doubt.
  const rootNames = [...config.fileNames].sort(compare);
  return ts.createProgram({
    rootNames,
    options: { ...config.options, noEmit: true },
    projectReferences: config.projectReferences,
  });
}

function toNode(unit: Unit): GraphNode {
  return {
    id: unit.id,
    kind: unit.kind,
    name: unit.name,
    file: unit.file,
    line: unit.line,
    group: unit.group,
    signature: unit.signature,
    fingerprint: unit.fingerprint,
    reads: [],
    writes: [],
  };
}
