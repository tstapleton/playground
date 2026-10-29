import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { fileURLToPath } from 'node:url';
import { extract } from '../src/extract/extract';

const tsconfig = fileURLToPath(new URL('./project/tsconfig.json', import.meta.url));
const { graph, warnings } = extract({ tsconfig, feature: 'src/feature' });
const node = (id: string) => graph.nodes.find((n) => n.id === id);
const edge = (from: string, to: string) => graph.edges.find((e) => e.from === from && e.to === to);

describe('extract', () => {
  it('finds store methods, local helpers and hooks', () => {
    assert.equal(node('counter.store.ts#CounterStore.increment')?.kind, 'store-method');
    assert.equal(node('counter.store.ts#CounterStore.(stamp)')?.kind, 'store-helper');
    assert.equal(node('counter.store.ts#CounterStore.onInit')?.kind, 'store-hook');
    assert.ok(edge('counter.store.ts#CounterStore.onInit', 'counter.store.ts#CounterStore.reset'));
  });

  it('records state written by patchState, including through updater functions', () => {
    assert.deepEqual(node('counter.store.ts#CounterStore.increment')?.writes, ['count']);
    assert.deepEqual(node('counter.store.ts#CounterStore.(stamp)')?.writes, ['updatedAt']);
    assert.deepEqual(node('counter.store.ts#CounterStore.increment')?.reads, ['CounterStore.count']);
  });

  it('names calls through an InjectionToken after the token, and marks abstract classes', () => {
    assert.equal(node('src/shared/tokens.ts#CLOCK.now')?.via, 'token');
    assert.equal(node('src/shared/tokens.ts#Logger.log')?.via, 'abstract');
    assert.equal(node('src/shared/tokens.ts#formatCount')?.kind, 'boundary');
  });

  it('never looks past the feature boundary', () => {
    assert.ok(graph.edges.every((e) => !e.from.startsWith('src/shared/')));
  });

  it('leaves Angular and NgRx calls out', () => {
    assert.ok(graph.nodes.every((n) => !n.id.startsWith('@angular/') && !n.id.startsWith('@ngrx/')));
  });

  it('connects template event bindings to store methods and component methods', () => {
    const handler = 'counter.component.ts#CounterComponent@template:app-counter-button(pressed)';
    assert.ok(edge(handler, 'counter.store.ts#CounterStore.increment'));
    assert.ok(edge(handler, 'counter.component.ts#CounterComponent.onReset'));
  });

  it("connects a child's output.emit() to the parent's handler for that output", () => {
    const e = edge('counter.component.ts#CounterButtonComponent@template:button(click)', 'counter.component.ts#CounterComponent@template:app-counter-button(pressed)');
    assert.equal(e?.kind, 'emit');
  });

  it('treats an effect in a class field as its own node', () => {
    assert.deepEqual(node('counter.component.ts#CounterComponent.logOnChange')?.reads, ['CounterStore.count']);
  });

  it('marks calls through a parameter as unresolved instead of guessing', () => {
    assert.equal(node('counter.store.ts#CounterStore.each?callback')?.kind, 'unresolved');
  });

  it('warns about templates it cannot read', () => {
    assert.deepEqual(warnings, ["src/feature/counter.component.ts: LegacyComponent uses templateUrl, which isn't analyzed yet"]);
  });
});
