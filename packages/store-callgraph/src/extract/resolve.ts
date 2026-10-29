import path from 'node:path';
import ts from 'typescript';
import type { GraphNode } from '../graph/model';
import { calleeName, lineOf, nameText, signatureOf, skipOuter } from './ts-utils';
import { type FeatureUnits, isNgrx, type Paths, posix, type Unit } from './units';

export type Target =
  | { kind: 'unit'; unit: Unit }
  | { kind: 'boundary'; node: GraphNode }
  | { kind: 'read'; key: string }
  | { kind: 'write'; keys: string[] }
  | { kind: 'emit'; cls: ts.ClassDeclaration; output: string }
  | { kind: 'unresolved'; text: string }
  | { kind: 'ignore' };

/** Library calls that are noise at this level. Matched as prefixes of the package name. */
export const DEFAULT_HIDE = ['@angular/', '@ngrx/', 'rxjs', 'tslib', 'zone.js'];

export interface ResolveOptions {
  /** Boundary IDs starting with one of these are left out. */
  hide: string[];
}

export class Resolver {
  private readonly unitByDecl = new Map<ts.Node, Unit>();

  constructor(
    private readonly checker: ts.TypeChecker,
    private readonly program: ts.Program,
    private readonly paths: Paths,
    private readonly feature: FeatureUnits,
    private readonly options: ResolveOptions,
  ) {
    for (const unit of feature.units) for (const decl of unit.decls) this.unitByDecl.set(decl, unit);
  }

  call(call: ts.CallExpression): Target {
    const callee = skipOuter(call.expression);
    const nameNode = ts.isPropertyAccessExpression(callee) ? callee.name : ts.isIdentifier(callee) ? callee : undefined;
    if (!nameNode) return { kind: 'ignore' };
    if (isNgrx(this.checker, callee, 'patchState')) return { kind: 'write', keys: patchedKeys(call) };

    const receiver = ts.isPropertyAccessExpression(callee) ? this.symbolOf(callee.expression) : undefined;
    const symbol = this.aliased(this.checker.getSymbolAtLocation(nameNode));
    if (!symbol) {
      const type = ts.isPropertyAccessExpression(callee)
        ? this.checker.getTypeAtLocation(callee.expression)
        : undefined;
      return type && type.flags & ts.TypeFlags.Any
        ? { kind: 'unresolved', text: callee.getText() }
        : { kind: 'ignore' };
    }
    return this.symbol(symbol, receiver, nameNode.text);
  }

  /** Resolves `a.b.c` against a class's instance type, as a template expression would. */
  chain(cls: ts.ClassDeclaration, chain: string[]): Target {
    const classSymbol = cls.name && this.checker.getSymbolAtLocation(cls.name);
    if (!classSymbol) return { kind: 'ignore' };
    let type = this.checker.getDeclaredTypeOfSymbol(classSymbol);
    let symbol: ts.Symbol | undefined;
    let receiver: ts.Symbol | undefined;
    for (const name of chain) {
      if (symbol) {
        receiver = symbol;
        type = this.checker.getNonNullableType(this.checker.getTypeOfSymbolAtLocation(symbol, cls));
      }
      symbol = type.getProperty(name);
      if (!symbol) return { kind: 'ignore' };
    }
    return symbol ? this.symbol(symbol, receiver, chain[chain.length - 1]) : { kind: 'ignore' };
  }

  private symbol(symbol: ts.Symbol, receiver: ts.Symbol | undefined, name: string): Target {
    if (name === 'emit' && receiver) {
      const output = this.outputOf(receiver);
      if (output) return output;
    }
    const decls = symbol.declarations ?? [];
    for (const decl of decls) {
      const unit = this.unitByDecl.get(decl);
      if (unit) return { kind: 'unit', unit };
    }
    for (const decl of decls) {
      const key = this.feature.stateKeys.get(decl);
      if (key) return { kind: 'read', key };
    }
    const decl = decls[0];
    if (!decl) return { kind: 'ignore' };

    const sf = decl.getSourceFile();
    if (this.program.isSourceFileDefaultLibrary(sf) || this.program.isSourceFileFromExternalLibrary(sf))
      return this.library(symbol, decl);
    const file = posix(sf.fileName);
    if (file.includes('/node_modules/')) return this.library(symbol, decl);
    if (isInside(this.paths.featureDir, sf.fileName)) {
      // Something local, like a variable inside the same function. Calls through a parameter
      // can't be followed.
      const throughParameter =
        ts.isParameter(decl) || (ts.isBindingElement(decl) && !!ts.findAncestor(decl, ts.isParameter));
      return throughParameter ? { kind: 'unresolved', text: name } : { kind: 'ignore' };
    }
    return this.boundary(symbol, decl, receiver, posix(path.relative(this.paths.projectDir, sf.fileName)));
  }

  private library(symbol: ts.Symbol, decl: ts.Node): Target {
    const sf = decl.getSourceFile();
    if (this.program.isSourceFileDefaultLibrary(sf)) return { kind: 'ignore' };
    const pkg = packageOf(posix(sf.fileName));
    if (!pkg || this.options.hide.some((h) => pkg.startsWith(h))) return { kind: 'ignore' };
    return this.boundary(symbol, decl, undefined, pkg);
  }

  private boundary(symbol: ts.Symbol, decl: ts.Node, receiver: ts.Symbol | undefined, file: string): Target {
    const container = ts.findAncestor(
      decl.parent,
      (n) => ts.isClassLike(n) || ts.isInterfaceDeclaration(n) || ts.isVariableDeclaration(n),
    );
    const owner = container && nameText((container as ts.NamedDeclaration).name as ts.PropertyName);
    let qualified = owner ? `${owner}.${symbol.name}` : symbol.name;
    let via: GraphNode['via'];
    if (
      container &&
      ts.isClassLike(container) &&
      ts.getCombinedModifierFlags(container as ts.Declaration) & ts.ModifierFlags.Abstract
    )
      via = 'abstract';
    if (container && ts.isInterfaceDeclaration(container)) via = 'interface';

    const token = receiver && this.injectionToken(receiver);
    if (token) {
      qualified = `${nameText(token.name)}.${symbol.name}`;
      file = posix(path.relative(this.paths.projectDir, token.getSourceFile().fileName));
      via = 'token';
    }
    const id = `${file}#${qualified}`;
    if (this.options.hide.some((h) => id.startsWith(h))) return { kind: 'ignore' };
    return {
      kind: 'boundary',
      node: {
        id,
        kind: 'boundary',
        name: qualified,
        file,
        line: token ? lineOf(token) : lineOf(decl),
        group: path.posix.dirname(file),
        signature: signatureOf(this.checker, decl),
        fingerprint: '',
        reads: [],
        writes: [],
        ...(via ? { via } : {}),
      },
    };
  }

  /** `analytics = inject(ANALYTICS)` → the `ANALYTICS` declaration, if it's an `InjectionToken`. */
  private injectionToken(receiver: ts.Symbol): ts.VariableDeclaration | undefined {
    const decl = receiver.valueDeclaration;
    if (
      !decl ||
      !(ts.isVariableDeclaration(decl) || ts.isParameter(decl) || ts.isPropertyDeclaration(decl)) ||
      !decl.initializer
    )
      return undefined;
    const init = skipOuter(decl.initializer);
    if (!ts.isCallExpression(init) || calleeName(init) !== 'inject' || !init.arguments[0]) return undefined;
    const token = this.aliased(this.symbolOf(init.arguments[0]))?.valueDeclaration;
    if (!token || !ts.isVariableDeclaration(token)) return undefined;
    const type = this.checker.getTypeAtLocation(token);
    return (type.aliasSymbol ?? type.getSymbol())?.name === 'InjectionToken' ? token : undefined;
  }

  /** A class field declared with `output()` or `@Output()`, in a class of the feature. */
  private outputOf(receiver: ts.Symbol): Target | undefined {
    const decl = receiver.valueDeclaration;
    if (!decl || !ts.isPropertyDeclaration(decl) || !ts.isClassDeclaration(decl.parent)) return undefined;
    if (!isInside(this.paths.featureDir, decl.getSourceFile().fileName)) return undefined;
    const init = decl.initializer && skipOuter(decl.initializer);
    const isOutput =
      (init && ts.isCallExpression(init) && ['output', 'outputFromObservable'].includes(calleeName(init))) ||
      (ts.getDecorators(decl) ?? []).some(
        (d) => ts.isCallExpression(d.expression) && calleeName(d.expression) === 'Output',
      );
    const name = nameText(decl.name);
    return isOutput && name ? { kind: 'emit', cls: decl.parent, output: name } : undefined;
  }

  private symbolOf(expression: ts.Expression): ts.Symbol | undefined {
    const e = skipOuter(expression);
    return this.checker.getSymbolAtLocation(ts.isPropertyAccessExpression(e) ? e.name : e);
  }

  private aliased(symbol: ts.Symbol | undefined): ts.Symbol | undefined {
    return symbol && symbol.flags & ts.SymbolFlags.Alias ? this.checker.getAliasedSymbol(symbol) : symbol;
  }
}

export function isInside(dir: string, file: string): boolean {
  const rel = path.relative(dir, file);
  return !!rel && !rel.startsWith('..') && !path.isAbsolute(rel);
}

function packageOf(file: string): string | undefined {
  const at = file.lastIndexOf('/node_modules/');
  if (at < 0) return undefined;
  const rest = file.slice(at + '/node_modules/'.length);
  const parts = rest.split('/');
  return parts[0].startsWith('@') ? `${parts[0]}/${parts[1]}` : parts[0];
}

/** Keys of the state updates passed to `patchState(store, …updates)`. */
function patchedKeys(call: ts.CallExpression): string[] {
  const keys: string[] = [];
  for (const arg of call.arguments.slice(1)) {
    let value = skipOuter(arg);
    if (ts.isArrowFunction(value) || ts.isFunctionExpression(value)) {
      const body = value.body;
      const returned = ts.isBlock(body) ? body.statements.find(ts.isReturnStatement)?.expression : body;
      value = returned ? skipOuter(returned) : value;
    }
    if (ts.isObjectLiteralExpression(value)) {
      for (const p of value.properties) keys.push(ts.isSpreadAssignment(p) ? '…' : (nameText(p.name) ?? '?'));
    } else if (ts.isCallExpression(value)) {
      keys.push(`${calleeName(value)}()`);
    } else {
      keys.push('?');
    }
  }
  return keys;
}
