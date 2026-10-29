import { createHash } from 'node:crypto';
import ts from 'typescript';
import type { CallSite } from '../graph/model';

export function hash(text: string): string {
  return createHash('sha256').update(text).digest('hex').slice(0, 16);
}

/** Hash of a node's tokens. Comments, whitespace and formatting don't change it. */
export function fingerprint(node: ts.Node): string {
  const tokens: string[] = [];
  const visit = (n: ts.Node) => {
    const children = n.getChildren();
    if (children.length === 0) {
      if (n.kind !== ts.SyntaxKind.EndOfFileToken) tokens.push(n.getText());
    } else {
      children.forEach(visit);
    }
  };
  visit(node);
  return hash(tokens.join('\u0001'));
}

const PRINT_FLAGS = ts.TypeFormatFlags.NoTruncation | ts.TypeFormatFlags.WriteArrowStyleSignature;

/** Parameter and return types of a declaration, without file paths. */
export function signatureOf(checker: ts.TypeChecker, decl: ts.Node): string {
  let text = '';
  if (ts.isFunctionLike(decl)) {
    const signature = checker.getSignatureFromDeclaration(decl as ts.SignatureDeclaration);
    if (signature) text = checker.signatureToString(signature, decl, PRINT_FLAGS);
  } else {
    const name = ts.getNameOfDeclaration(decl as ts.Declaration);
    const type = checker.getTypeAtLocation(name ?? decl);
    text = checker.typeToString(type, decl, PRINT_FLAGS);
  }
  return text.replace(/import\("[^"]*"\)\./g, '');
}

/** `a.b.c` → `c`, `foo` → `foo`; anything else → `?`. */
export function calleeName(call: ts.CallExpression | ts.NewExpression): string {
  const callee = skipOuter(call.expression);
  if (ts.isPropertyAccessExpression(callee)) return callee.name.text;
  if (ts.isIdentifier(callee)) return callee.text;
  return '?';
}

/** Strips parentheses, `!`, `as` and `satisfies`. */
export function skipOuter(node: ts.Expression): ts.Expression {
  for (;;) {
    if (
      ts.isParenthesizedExpression(node) ||
      ts.isNonNullExpression(node) ||
      ts.isAsExpression(node) ||
      ts.isSatisfiesExpression(node)
    ) {
      node = node.expression;
    } else {
      return node;
    }
  }
}

export function lineOf(node: ts.Node): number {
  const sf = node.getSourceFile();
  return sf.getLineAndCharacterOfPosition(node.getStart(sf)).line + 1;
}

export function nameText(name: ts.PropertyName | ts.BindingName | undefined): string | undefined {
  if (!name) return undefined;
  if (ts.isIdentifier(name) || ts.isPrivateIdentifier(name) || ts.isStringLiteral(name) || ts.isNumericLiteral(name))
    return name.text;
  return undefined;
}

/**
 * Where a call sits inside `root`: the callbacks around it (`switchMap`, `tap`), the
 * operators piped onto its result, and the control flow around it.
 */
export function siteOf(call: ts.CallExpression, root: ts.Node): CallSite {
  const within: string[] = [];
  const branch: string[] = [];
  for (let n: ts.Node = call; n !== root && n.parent; n = n.parent) {
    const p = n.parent;
    if (
      ts.isFunctionLike(n) &&
      (ts.isCallExpression(p) || ts.isNewExpression(p)) &&
      p.arguments?.includes(n as ts.Expression)
    ) {
      within.unshift(calleeName(p));
    }
    const b = branchOf(n, p);
    if (b) branch.unshift(b);
  }
  return { within, piped: pipedOnto(call), branch };
}

function branchOf(n: ts.Node, p: ts.Node): string | undefined {
  if (ts.isIfStatement(p)) return n === p.thenStatement ? 'if' : n === p.elseStatement ? 'else' : undefined;
  if (ts.isConditionalExpression(p)) return n === p.whenTrue || n === p.whenFalse ? '?:' : undefined;
  if (ts.isBinaryExpression(p) && n === p.right) {
    const op = p.operatorToken.kind;
    if (op === ts.SyntaxKind.AmpersandAmpersandToken) return '&&';
    if (op === ts.SyntaxKind.BarBarToken) return '||';
    if (op === ts.SyntaxKind.QuestionQuestionToken) return '??';
  }
  if ((ts.isForStatement(p) || ts.isForOfStatement(p) || ts.isForInStatement(p)) && n === p.statement) return 'for';
  if ((ts.isWhileStatement(p) || ts.isDoStatement(p)) && n === p.statement) return 'while';
  if (ts.isCaseClause(p) || ts.isDefaultClause(p)) return p.statements.includes(n as ts.Statement) ? 'case' : undefined;
  if (ts.isTryStatement(p)) return n === p.tryBlock ? 'try' : n === p.finallyBlock ? 'finally' : undefined;
  if (ts.isCatchClause(p)) return 'catch';
  return undefined;
}

/** `x().pipe(a(), b())` → `["a", "b"]`; also for a call wrapped in `defer(() => x())`. */
function pipedOnto(call: ts.CallExpression): string[] {
  let source: ts.Expression = call;
  const p = call.parent;
  const fn =
    ts.isArrowFunction(p) && p.body === call
      ? p
      : ts.isReturnStatement(p)
        ? ts.findAncestor(p, ts.isFunctionLike)
        : undefined;
  if (fn && ts.isCallExpression(fn.parent) && calleeName(fn.parent) === 'defer') source = fn.parent;
  const access = source.parent;
  if (
    access &&
    ts.isPropertyAccessExpression(access) &&
    access.name.text === 'pipe' &&
    ts.isCallExpression(access.parent) &&
    access.parent.expression === access
  ) {
    return access.parent.arguments.map((a) => (ts.isCallExpression(a) ? calleeName(a) : '?'));
  }
  return [];
}
