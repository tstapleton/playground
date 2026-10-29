import assert from 'node:assert/strict';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { describe, it } from 'node:test';
import { fileURLToPath } from 'node:url';
import { diffDiagrams } from '../src/api';
import { diffGraphs } from '../src/diff/diff';
import { extract } from '../src/extract/extract';
import { serialize } from '../src/graph/canonical';
import { Graph } from '../src/graph/model';
import { diffPage } from '../src/render/html';
import { diffComment } from '../src/render/markdown';

// The two fixture apps: the same feature before and after a pull request.
const fixture = (side: string) => fileURLToPath(new URL(`../../../fixtures/${side}/tsconfig.app.json`, import.meta.url));
const golden = (name: string) => fileURLToPath(new URL(`./golden/${name}`, import.meta.url));
const FEATURE = 'src/app/features/dynamic-form';

/** Compares with the checked-in file; `UPDATE_GOLDEN=1` rewrites it instead. */
function matchesGolden(name: string, actual: string) {
  if (process.env.UPDATE_GOLDEN || !existsSync(golden(name))) {
    mkdirSync(fileURLToPath(new URL('./golden/', import.meta.url)), { recursive: true });
    writeFileSync(golden(name), actual);
  }
  assert.equal(actual, readFileSync(golden(name), 'utf8'), `${name} differs from test/golden; run UPDATE_GOLDEN=1 npm test if the change is intended`);
}

const graphOf = (side: string): Graph => {
  const { graph, warnings } = extract({ tsconfig: fixture(side), feature: FEATURE });
  assert.deepEqual(warnings, []);
  return graph;
};

describe('fixtures', () => {
  const base = graphOf('base');
  const head = graphOf('pr');
  const diff = diffGraphs(base, head);
  const views = diffDiagrams(diff);
  const labels = { base: 'base', head: 'pr' };

  it('match the golden graphs', () => {
    matchesGolden('base.json', serialize(base));
    matchesGolden('pr.json', serialize(head));
  });

  it('match the golden pull-request comment', () => {
    matchesGolden('comment.md', diffComment(diff, views, labels));
  });

  it('draw one diagram per changed store method, then the remaining changes', () => {
    assert.deepEqual(
      views.map((v) => v.title),
      [
        'DynamicFormStore.load',
        'DynamicFormStore.markTouched',
        'DynamicFormStore.setValue',
        'DynamicFormStore.submit',
        'DynamicFormComponent.hintFor, DynamicFormComponent template, DynamicFormStore.clientErrors and 1 more',
        'FieldComponent template',
      ],
    );
  });

  it('give identical output when run again, from another directory', () => {
    const cwd = process.cwd();
    try {
      process.chdir(fileURLToPath(new URL('./project/', import.meta.url)));
      const again = diffGraphs(graphOf('base'), graphOf('pr'));
      assert.equal(JSON.stringify(again), JSON.stringify(diff));
      assert.equal(diffPage(again, diffDiagrams(again), labels), diffPage(diff, views, labels));
    } finally {
      process.chdir(cwd);
    }
  });

  it('contain no absolute paths', () => {
    const root = fileURLToPath(new URL('../../../', import.meta.url));
    for (const text of [serialize(base), serialize(head), JSON.stringify(diff)]) assert.ok(!text.includes(root));
  });
});
