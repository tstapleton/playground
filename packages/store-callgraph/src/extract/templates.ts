import path from 'node:path';
import {
  type AST,
  type Call,
  type CssSelector,
  createCssSelectorFromNode,
  ImplicitReceiver,
  PropertyRead,
  parseTemplate,
  RecursiveAstVisitor,
  type SafeCall,
  SafePropertyRead,
  type TmplAstBoundAttribute,
  type TmplAstBoundEvent,
  type TmplAstBoundText,
  TmplAstElement,
  type TmplAstForLoopBlock,
  type TmplAstIfBlockBranch,
  type TmplAstLetDeclaration,
  TmplAstRecursiveVisitor,
  type TmplAstSwitchBlock,
  type TmplAstSwitchBlockCase,
  type TmplAstTemplate,
  tmplAstVisitAll,
} from '@angular/compiler';
import { hash, lineOf } from './ts-utils';
import type { Component, Paths, Unit } from './units';
import { posix } from './units';

/** A call in a template, as a chain of property names from the component: `store.setValue`. */
export interface TemplateCall {
  unit: Unit;
  chain: string[];
}

/** An element whose outputs the template listens to. */
export interface ListeningElement {
  selector: CssSelector;
  handlers: Map<string, Unit>;
}

export interface TemplateInfo {
  units: Unit[];
  calls: TemplateCall[];
  elements: ListeningElement[];
  warnings: string[];
}

export function analyzeTemplate({ cls, name: className, template }: Component, paths: Paths): TemplateInfo {
  const info: TemplateInfo = { units: [], calls: [], elements: [], warnings: [] };
  const sf = cls.getSourceFile();
  const featurePath = posix(path.relative(paths.featureDir, sf.fileName));
  const file = posix(path.relative(paths.projectDir, sf.fileName));
  if (template.templateUrl) {
    info.warnings.push(`${file}: ${className} uses templateUrl, which isn't analyzed yet`);
    return info;
  }

  const parsed = parseTemplate(template.text, `${file}#${className}`, { preserveWhitespaces: false });
  for (const error of parsed.errors ?? []) info.warnings.push(`${file}: ${className} template: ${error.msg}`);

  // Template offsets are relative to the string; lines are reported in the .ts file.
  const firstLine = lineOf(template.node);
  const unit = (suffix: string, kind: Unit['kind'], line: number, source: string): Unit => ({
    id: `${featurePath}#${className}@template${suffix}`,
    kind,
    name: `${className} ${suffix ? suffix.slice(1) : 'template'}`,
    group: className,
    file,
    line: firstLine + line,
    decls: [],
    body: cls,
    fingerprint: hash(source),
    signature: '',
  });

  const render = unit('', 'template-render', 0, template.text.replace(/\s+/g, ' ').trim());
  const handlers = new Map<string, { unit: Unit; sources: string[] }>();
  const handlerOf = new Map<TmplAstBoundEvent, Unit>();
  const calls: TemplateCall[] = [];
  const collect = (ast: AST | null | undefined, into: Unit) => {
    if (!ast) return;
    const collector = new CallCollector();
    ast.visit(collector);
    for (const chain of collector.chains) calls.push({ unit: into, chain });
  };

  const elementOf = (node: TmplAstElement | TmplAstTemplate) => {
    if (node.outputs.length === 0) return;
    const tag = node instanceof TmplAstElement ? node.name : (node.tagName ?? 'ng-template');
    const listening: ListeningElement = { selector: createCssSelectorFromNode(node), handlers: new Map() };
    for (const event of node.outputs) {
      const key = `:${tag}(${event.name})`;
      let handler = handlers.get(key);
      if (!handler) {
        handler = { unit: unit(key, 'template-handler', event.sourceSpan.start.line, ''), sources: [] };
        handlers.set(key, handler);
      }
      handler.sources.push(event.sourceSpan.toString().replace(/\s+/g, ' '));
      listening.handlers.set(event.name, handler.unit);
      handlerOf.set(event, handler.unit);
    }
    info.elements.push(listening);
  };

  class Visitor extends TmplAstRecursiveVisitor {
    override visitElement(node: TmplAstElement) {
      elementOf(node);
      super.visitElement(node);
    }
    override visitTemplate(node: TmplAstTemplate) {
      elementOf(node);
      super.visitTemplate(node);
    }
    override visitBoundEvent(event: TmplAstBoundEvent) {
      const handler = handlerOf.get(event);
      if (handler) collect(event.handler, handler);
    }
    override visitBoundAttribute(attribute: TmplAstBoundAttribute) {
      collect(attribute.value, render);
    }
    override visitBoundText(text: TmplAstBoundText) {
      collect(text.value, render);
    }
    override visitIfBlockBranch(block: TmplAstIfBlockBranch) {
      collect(block.expression, render);
      super.visitIfBlockBranch(block);
    }
    override visitForLoopBlock(block: TmplAstForLoopBlock) {
      collect(block.expression, render);
      super.visitForLoopBlock(block);
    }
    override visitSwitchBlock(block: TmplAstSwitchBlock) {
      collect(block.expression, render);
      super.visitSwitchBlock(block);
    }
    override visitSwitchBlockCase(block: TmplAstSwitchBlockCase) {
      collect(block.expression, render);
      super.visitSwitchBlockCase(block);
    }
    override visitLetDeclaration(decl: TmplAstLetDeclaration) {
      collect(decl.value, render);
    }
  }

  // Bound events are visited after their element, so the element registers its handlers first.
  tmplAstVisitAll(new Visitor(), parsed.nodes);
  for (const { unit: handler, sources } of handlers.values()) handler.fingerprint = hash(sources.join('\u0001'));

  info.units.push(render, ...[...handlers.values()].map((h) => h.unit));
  info.calls.push(...calls);
  return info;
}

/** Collects `a.b.c(…)` calls whose chain starts at the component. */
class CallCollector extends RecursiveAstVisitor {
  readonly chains: string[][] = [];

  override visitCall(ast: Call, context: unknown) {
    this.record(ast.receiver);
    return super.visitCall(ast, context);
  }

  override visitSafeCall(ast: SafeCall, context: unknown) {
    this.record(ast.receiver);
    return super.visitSafeCall(ast, context);
  }

  private record(receiver: AST) {
    const chain: string[] = [];
    let node: AST = receiver;
    while (node instanceof PropertyRead || node instanceof SafePropertyRead) {
      chain.unshift(node.name);
      node = node.receiver;
    }
    if (chain.length && node instanceof ImplicitReceiver) this.chains.push(chain);
  }
}
