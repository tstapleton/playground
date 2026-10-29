import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { describeDiff } from '../src/diff/describe';
import { diffGraphs } from '../src/diff/diff';
import type { CallSite, Graph, GraphEdge, GraphNode } from '../src/graph/model';

const node = (name: string, extra: Partial<GraphNode> = {}): GraphNode => ({
  id: `store.ts#${name}`,
  kind: 'store-method',
  name,
  file: 'store.ts',
  line: 1,
  group: 'Store',
  signature: '() => void',
  fingerprint: `fp-${name}`,
  reads: [],
  writes: [],
  ...extra,
});
const api = (name: string, extra: Partial<GraphNode> = {}) =>
  node(name, { id: `api.ts#${name}`, kind: 'boundary', group: 'core/api', fingerprint: '', ...extra });
const site = (within: string[] = []): CallSite => ({ within, piped: [], branch: [] });
const call = (from: GraphNode, to: GraphNode, sites = [site()]): GraphEdge => ({
  from: from.id,
  to: to.id,
  kind: 'call',
  sites,
});
const graph = (nodes: GraphNode[], edges: GraphEdge[]): Graph => ({
  version: 1,
  inputs: { feature: 'f', analyzer: 'test' },
  nodes,
  edges,
});
const sentences = (base: Graph, head: Graph) => describeDiff(diffGraphs(base, head)).map((c) => c.text);

describe('describeDiff', () => {
  it('says what changed in words, owners in bold and functions as code', () => {
    const save = node('Store.save');
    const lists = api('GroceryApi.lists');
    assert.deepEqual(sentences(graph([save], []), graph([{ ...save, fingerprint: 'x' }, lists], [call(save, lists)])), [
      '**Store** `save()` now calls **GroceryApi** `lists()`',
    ]);
  });

  it('leaves out a new function that a new call already introduces, but names one nothing calls', () => {
    const save = node('Store.save');
    const helper = node('Store.(stamp)', { kind: 'store-helper' });
    const unused = node('Store.archive');
    const head = graph([{ ...save, fingerprint: 'x' }, helper, unused], [call(save, helper)]);
    assert.deepEqual(sentences(graph([save], []), head), [
      '**Store** `save()` now calls **Store** `(stamp)`',
      'New: **Store** `archive()`',
    ]);
  });

  it('says where a call moved to and where it was', () => {
    const load = node('Store.load');
    const get = api('RecipesApi.get');
    const base = graph([load, get], [call(load, get, [site(['tap'])])]);
    const head = graph([{ ...load, fingerprint: 'x' }, get], [call(load, get, [site(['catchError'])])]);
    assert.deepEqual(sentences(base, head), [
      '**Store** `load()` calls **RecipesApi** `get()` at a different point: `catchError` (was `tap`)',
    ]);
  });

  it('ranks calls above state and body-only changes', () => {
    const a = node('Store.a', { writes: ['status'] });
    const b = node('Store.b');
    const c = node('Store.c');
    const head = graph(
      [{ ...a, writes: ['status', 'error'], fingerprint: 'x' }, { ...b, fingerprint: 'y' }, c],
      [call(b, c)],
    );
    assert.deepEqual(sentences(graph([a, b, c], []), head), [
      '**Store** `b()` now calls **Store** `c()`',
      '**Store** `a()` now also updates `error`',
    ]);
  });

  it('describes a body-only change and a changed signature', () => {
    const a = node('Store.a');
    const get = api('Api.get');
    const head = graph(
      [
        { ...a, fingerprint: 'x' },
        { ...get, signature: '(id: string) => void' },
      ],
      [],
    );
    assert.deepEqual(sentences(graph([a, get], []), head), [
      '**Api** `get()` takes or returns something else: `(id: string) => void` instead of `() => void`',
      '**Store** `a()` changed, but not what it calls or the state it uses',
    ]);
  });
});
