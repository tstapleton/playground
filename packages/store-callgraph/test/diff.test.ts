import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { diffGraphs } from '../src/diff/diff';
import type { CallSite, Graph, GraphEdge, GraphNode } from '../src/graph/model';

const fn = (id: string, extra: Partial<GraphNode> = {}): GraphNode => ({
  id,
  kind: 'store-method',
  name: id,
  file: 'a.ts',
  line: 1,
  group: 'Store',
  signature: '() => void',
  fingerprint: `fp-${id}`,
  reads: [],
  writes: [],
  ...extra,
});
const site = (within: string[] = [], branch: string[] = []): CallSite => ({ within, piped: [], branch });
const call = (from: string, to: string, sites = [site()]): GraphEdge => ({ from, to, kind: 'call', sites });
const graph = (nodes: GraphNode[], edges: GraphEdge[]): Graph => ({
  version: 1,
  inputs: { feature: 'f', analyzer: 'test' },
  nodes,
  edges,
});
const classOf = (base: Graph, head: Graph) =>
  Object.fromEntries(diffGraphs(base, head).nodes.map((n) => [n.id, n.class]));

describe('diffGraphs', () => {
  it('reports nothing for identical graphs', () => {
    const g = graph([fn('a'), fn('b')], [call('a', 'b')]);
    assert.deepEqual(classOf(g, g), { a: 'unchanged', b: 'unchanged' });
  });

  it('separates a new callee from a body-only change', () => {
    const base = graph([fn('a'), fn('b'), fn('c')], [call('a', 'b')]);
    const head = graph(
      [fn('a', { fingerprint: 'x' }), fn('b', { fingerprint: 'y' }), fn('c')],
      [call('a', 'b'), call('a', 'c')],
    );
    assert.deepEqual(classOf(base, head), { a: 'structural', b: 'implementation', c: 'unchanged' });
  });

  it('reports a call that moved into another callback as a context change', () => {
    const base = graph([fn('a'), fn('b')], [call('a', 'b', [site(['tap'])])]);
    const head = graph([fn('a', { fingerprint: 'x' }), fn('b')], [call('a', 'b', [site(['catchError'])])]);
    const diff = diffGraphs(base, head);
    assert.equal(diff.nodes.find((n) => n.id === 'a')?.class, 'context');
    assert.equal(diff.edges[0].status, 'context');
  });

  it('reports different state writes as a state change', () => {
    const base = graph([fn('a', { writes: ['status'] })], []);
    const head = graph([fn('a', { writes: ['status', 'error'], fingerprint: 'x' })], []);
    const [change] = diffGraphs(base, head).nodes;
    assert.equal(change.class, 'state');
    assert.deepEqual(change.writes, { added: ['error'], removed: [] });
  });

  it('reports a signature change as structural', () => {
    const base = graph([fn('a')], []);
    const head = graph([fn('a', { signature: '(x: string) => void' })], []);
    assert.equal(diffGraphs(base, head).nodes[0].class, 'structural');
  });

  it('pairs a renamed method by its body, and keeps its edges unchanged', () => {
    const base = graph([fn('load', { fingerprint: 'same' }), fn('api')], [call('load', 'api')]);
    const head = graph([fn('fetch', { fingerprint: 'same' }), fn('api')], [call('fetch', 'api')]);
    const diff = diffGraphs(base, head);
    const fetch = diff.nodes.find((n) => n.id === 'fetch');
    assert.ok(fetch);
    assert.equal(fetch.class, 'renamed');
    assert.equal(fetch.renamedFrom, 'load');
    assert.deepEqual(
      diff.edges.map((e) => e.status),
      ['unchanged'],
    );
  });

  it('pairs a renamed method by its callees when the body changed too', () => {
    const base = graph([fn('old'), fn('x'), fn('y')], [call('old', 'x'), call('old', 'y')]);
    const head = graph([fn('new', { fingerprint: 'other' }), fn('x'), fn('y')], [call('new', 'x'), call('new', 'y')]);
    const change = diffGraphs(base, head).nodes.find((n) => n.id === 'new');
    assert.ok(change);
    assert.equal(change.renamedFrom, 'old');
    assert.equal(change.class, 'implementation');
  });

  it('does not pair boundary nodes, so a swapped dependency shows as removed and added', () => {
    const dep = (id: string) => fn(id, { kind: 'boundary', fingerprint: '' });
    const base = graph([fn('a'), dep('Old.api')], [call('a', 'Old.api')]);
    const head = graph([fn('a'), dep('New.api')], [call('a', 'New.api')]);
    assert.deepEqual(classOf(base, head), { a: 'structural', 'New.api': 'added', 'Old.api': 'removed' });
  });
});
