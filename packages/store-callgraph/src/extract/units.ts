import path from 'node:path';
import ts from 'typescript';
import { NodeKind } from '../graph/model';
import { calleeName, fingerprint, lineOf, nameText, signatureOf, skipOuter } from './ts-utils';

/** A function in the feature that becomes a graph node. */
export interface Unit {
  id: string;
  kind: NodeKind;
  name: string;
  group: string;
  file: string;
  line: number;
  /** Declarations a call can resolve to. */
  decls: ts.Node[];
  /** Walked for calls. */
  body: ts.Node;
  fingerprint: string;
  signature: string;
  /** The store whose `patchState` calls this unit makes, if any. */
  store?: string;
  /** A computed signal: callers read it rather than call it. */
  isSignal?: boolean;
}

export interface FeatureUnits {
  units: Unit[];
  /** State property declarations → `Store.key`. */
  stateKeys: Map<ts.Node, string>;
  /** Classes with an inline `template`, for template analysis. */
  components: ts.ClassDeclaration[];
}

/** Calls whose function argument is the real body: `computed(() => …)`. */
const BODY_WRAPPERS = new Set(['computed', 'effect', 'linkedSignal', 'signalMethod', 'afterRenderEffect']);
/** Calls that make a class field or store local a function-like unit. */
const UNIT_CALLS = new Set([...BODY_WRAPPERS, 'rxMethod']);

export interface Paths {
  projectDir: string;
  featureDir: string;
}

export function posix(p: string): string {
  return p.split(path.sep).join('/');
}

export function discoverUnits(checker: ts.TypeChecker, files: ts.SourceFile[], paths: Paths): FeatureUnits {
  const units: Unit[] = [];
  const stateKeys = new Map<ts.Node, string>();
  const components: ts.ClassDeclaration[] = [];

  for (const sf of files) {
    const featurePath = posix(path.relative(paths.featureDir, sf.fileName));
    const file = posix(path.relative(paths.projectDir, sf.fileName));
    const make = (qualified: string, kind: NodeKind, group: string, decls: ts.Node[], body: ts.Node, fpNode: ts.Node, sigNode: ts.Node, store?: string): Unit => ({
      id: `${featurePath}#${qualified}`,
      kind,
      name: qualified,
      group,
      file,
      line: lineOf(decls[0]),
      decls,
      body,
      fingerprint: fingerprint(fpNode),
      signature: signatureOf(checker, sigNode),
      store,
    });

    const visit = (node: ts.Node) => {
      if (ts.isCallExpression(node) && isNgrx(checker, node.expression, 'signalStore')) {
        units.push(...storeUnits(checker, node, make, stateKeys));
      } else if (ts.isClassDeclaration(node) && node.name) {
        units.push(...classUnits(node, make));
        if (inlineTemplate(node)) components.push(node);
      }
      ts.forEachChild(node, visit);
    };
    visit(sf);

    for (const statement of sf.statements) {
      const group = path.basename(sf.fileName);
      if (ts.isFunctionDeclaration(statement) && statement.name && statement.body) {
        units.push(make(statement.name.text, 'function', group, [statement], statement, statement, statement));
      } else if (ts.isVariableStatement(statement)) {
        for (const decl of statement.declarationList.declarations) {
          const init = decl.initializer && skipOuter(decl.initializer);
          if (init && ts.isIdentifier(decl.name) && isFunctionValue(init)) {
            units.push(make(decl.name.text, 'function', group, [decl], init, init, decl));
          }
        }
      }
    }
  }

  return { units, stateKeys, components };
}

type Make = (qualified: string, kind: NodeKind, group: string, decls: ts.Node[], body: ts.Node, fpNode: ts.Node, sigNode: ts.Node, store?: string) => Unit;

function storeUnits(checker: ts.TypeChecker, call: ts.CallExpression, make: Make, stateKeys: Map<ts.Node, string>): Unit[] {
  const store = storeName(call);
  const units: Unit[] = [];
  for (const arg of call.arguments) {
    if (!ts.isCallExpression(arg)) continue;
    const feature = calleeName(arg);
    const input = arg.arguments[0] && skipOuter(arg.arguments[0]);
    if (!input || !isNgrx(checker, arg.expression, feature)) continue;

    if (feature === 'withState') {
      for (const prop of checker.getTypeAtLocation(input).getProperties()) {
        for (const decl of prop.declarations ?? []) if (!stateKeys.has(decl)) stateKeys.set(decl, `${store}.${prop.name}`);
      }
    } else if (feature === 'withMethods' || feature === 'withComputed' || feature === 'withHooks') {
      const publicKind: NodeKind = feature === 'withMethods' ? 'store-method' : feature === 'withComputed' ? 'store-computed' : 'store-hook';
      const localKind: NodeKind = feature === 'withComputed' ? 'store-computed' : 'store-helper';
      const { returned, locals } = factoryParts(input);
      const byLocal = new Map<ts.Node, Unit>();
      for (const local of locals) {
        const name = nameText(local.name)!;
        const value = ts.isFunctionDeclaration(local) ? local : skipOuter(local.initializer!);
        const unit = make(`${store}.(${name})`, localKind, store, [local], bodyOf(value), value, local, store);
        unit.isSignal = isSignalValue(value);
        byLocal.set(local, unit);
        units.push(unit);
      }
      for (const member of returned?.properties ?? []) {
        const name = nameText(member.name);
        if (!name) continue;
        // `{ helper }` or `{ name: helper }` publishes a local: one unit, under its public name.
        const target = ts.isShorthandPropertyAssignment(member)
          ? member.name
          : ts.isPropertyAssignment(member) && ts.isIdentifier(skipOuter(member.initializer))
            ? (skipOuter(member.initializer) as ts.Identifier)
            : undefined;
        const local = target && localDeclaration(checker, target, byLocal);
        if (local) {
          const unit = byLocal.get(local)!;
          Object.assign(unit, { id: unit.id.replace(/#.*$/, `#${store}.${name}`), name: `${store}.${name}`, kind: publicKind });
          unit.decls.push(member);
        } else if (ts.isMethodDeclaration(member) && member.body) {
          units.push(make(`${store}.${name}`, publicKind, store, [member], member, member, member, store));
        } else if (ts.isPropertyAssignment(member)) {
          const value = skipOuter(member.initializer);
          const unit = make(`${store}.${name}`, publicKind, store, [member], bodyOf(value), value, member, store);
          unit.isSignal = isSignalValue(value);
          units.push(unit);
        }
      }
    }
  }
  return units;
}

function classUnits(cls: ts.ClassDeclaration, make: Make): Unit[] {
  const className = cls.name!.text;
  const units: Unit[] = [];
  for (const member of cls.members) {
    if ((ts.isMethodDeclaration(member) || ts.isGetAccessorDeclaration(member) || ts.isSetAccessorDeclaration(member)) && member.body) {
      const name = nameText(member.name);
      const prefix = ts.isGetAccessorDeclaration(member) ? 'get ' : ts.isSetAccessorDeclaration(member) ? 'set ' : '';
      if (name) units.push(make(`${className}.${prefix}${name}`, 'class-method', className, [member], member, member, member));
    } else if (ts.isConstructorDeclaration(member) && member.body) {
      units.push(make(`${className}.constructor`, 'class-method', className, [member], member, member, member));
    } else if (ts.isPropertyDeclaration(member) && member.initializer) {
      const value = skipOuter(member.initializer);
      const name = nameText(member.name);
      if (name && isFunctionValue(value)) {
        const unit = make(`${className}.${name}`, 'class-field', className, [member], bodyOf(value), value, member);
        unit.isSignal = isSignalValue(value);
        units.push(unit);
      }
    }
  }
  return units;
}

function isFunctionValue(value: ts.Expression): boolean {
  return ts.isArrowFunction(value) || ts.isFunctionExpression(value) || (ts.isCallExpression(value) && UNIT_CALLS.has(calleeName(value)));
}

function isSignalValue(value: ts.Node): boolean {
  return ts.isCallExpression(value) && ['computed', 'linkedSignal'].includes(calleeName(value));
}

/** The part of a value to walk for calls: the callback of `computed(() => …)`, else the value. */
function bodyOf(value: ts.Node): ts.Node {
  if (ts.isCallExpression(value) && BODY_WRAPPERS.has(calleeName(value))) {
    const fn = value.arguments[0] && skipOuter(value.arguments[0]);
    if (fn && (ts.isArrowFunction(fn) || ts.isFunctionExpression(fn))) return fn;
  }
  return value;
}

/** The object a feature factory returns, and the function-valued locals it declares first. */
function factoryParts(input: ts.Expression): { returned?: ts.ObjectLiteralExpression; locals: (ts.VariableDeclaration | ts.FunctionDeclaration)[] } {
  if (ts.isObjectLiteralExpression(input)) return { returned: input, locals: [] };
  if (!ts.isArrowFunction(input) && !ts.isFunctionExpression(input)) return { locals: [] };
  if (!ts.isBlock(input.body)) {
    const body = skipOuter(input.body);
    return { returned: ts.isObjectLiteralExpression(body) ? body : undefined, locals: [] };
  }
  const locals: (ts.VariableDeclaration | ts.FunctionDeclaration)[] = [];
  let returned: ts.ObjectLiteralExpression | undefined;
  for (const statement of input.body.statements) {
    if (ts.isFunctionDeclaration(statement) && statement.name && statement.body) locals.push(statement);
    if (ts.isVariableStatement(statement)) {
      for (const decl of statement.declarationList.declarations) {
        if (ts.isIdentifier(decl.name) && decl.initializer && isFunctionValue(skipOuter(decl.initializer))) locals.push(decl);
      }
    }
    if (ts.isReturnStatement(statement) && statement.expression) {
      const value = skipOuter(statement.expression);
      if (ts.isObjectLiteralExpression(value)) returned = value;
    }
  }
  return { returned, locals };
}

function localDeclaration(checker: ts.TypeChecker, id: ts.Identifier, byLocal: Map<ts.Node, Unit>): ts.Node | undefined {
  const symbol = ts.isShorthandPropertyAssignment(id.parent)
    ? checker.getShorthandAssignmentValueSymbol(id.parent)
    : checker.getSymbolAtLocation(id);
  return symbol?.declarations?.find((d) => byLocal.has(d));
}

function storeName(call: ts.CallExpression): string {
  const p = call.parent;
  if (ts.isVariableDeclaration(p) && ts.isIdentifier(p.name)) return p.name.text;
  const cls = ts.findAncestor(call, ts.isClassDeclaration);
  if (cls?.name && ts.isHeritageClause(call.parent.parent)) return cls.name.text;
  return `signalStore@${lineOf(call)}`;
}

/** True if `expression` names `name` exported by `@ngrx/signals` (or its entry points). */
export function isNgrx(checker: ts.TypeChecker, expression: ts.Expression, name: string): boolean {
  const callee = skipOuter(expression);
  const id = ts.isIdentifier(callee) ? callee : ts.isPropertyAccessExpression(callee) ? callee.name : undefined;
  if (!id || id.text !== name) return false;
  let symbol = checker.getSymbolAtLocation(id);
  if (symbol && symbol.flags & ts.SymbolFlags.Alias) symbol = checker.getAliasedSymbol(symbol);
  return !!symbol?.declarations?.some((d) => posix(d.getSourceFile().fileName).includes('/@ngrx/signals/'));
}

/** The `template:` string of a `@Component`, if inline. */
export function inlineTemplate(cls: ts.ClassDeclaration): { text: string; node: ts.Node; selector?: string; templateUrl: boolean } | undefined {
  for (const decorator of ts.getDecorators(cls) ?? []) {
    const call = decorator.expression;
    if (!ts.isCallExpression(call) || calleeName(call) !== 'Component') continue;
    const meta = call.arguments[0];
    if (!meta || !ts.isObjectLiteralExpression(meta)) continue;
    const prop = (key: string) =>
      meta.properties.find((p): p is ts.PropertyAssignment => ts.isPropertyAssignment(p) && nameText(p.name) === key)?.initializer;
    const template = prop('template');
    const selector = prop('selector');
    const selectorText = selector && ts.isStringLiteralLike(selector) ? selector.text : undefined;
    if (template && ts.isStringLiteralLike(template)) return { text: template.text, node: template, selector: selectorText, templateUrl: false };
    if (prop('templateUrl')) return { text: '', node: meta, selector: selectorText, templateUrl: true };
  }
  return undefined;
}
