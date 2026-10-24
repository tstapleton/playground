import { ApplicationRef } from '@angular/core';
import { mkdirSync, writeFileSync } from 'node:fs';
import { basename, join, relative } from 'node:path';
import { recordUserEvents } from './dom-recorder';
import { toSequenceDiagram } from './mermaid';
import { tracer, tracingEnabled } from './tracer';

export const TRACE_DIR = join(process.cwd(), 'traces');

/** With TRACE=1, writes one sequence diagram per test to traces/<spec>/<test>.md. */
export function installTraceHooks(): void {
  if (!tracingEnabled) return;

  // Change detection belongs to the UI, whichever participant scheduled it.
  const appRef = ApplicationRef.prototype as unknown as Record<string, (...args: unknown[]) => unknown>;
  const tickName = typeof appRef['_tick'] === 'function' ? '_tick' : 'tick';
  const tick = appRef[tickName];
  appRef[tickName] = function (this: unknown, ...args: unknown[]) {
    return tracer.runAs(tracer.uiName, () => tick.apply(this, args));
  };

  let stopRecordingDom: () => void = () => undefined;

  beforeEach(() => {
    tracer.start();
    stopRecordingDom = recordUserEvents(tracer);
  });

  afterEach(() => {
    stopRecordingDom();
    const events = tracer.stop();
    if (!events.length) return;

    const { testPath = '', currentTestName = 'test' } = expect.getState();
    const spec = basename(testPath).replace(/\.spec\.ts$/, '');
    const dir = join(TRACE_DIR, spec);
    mkdirSync(dir, { recursive: true });
    const file = join(dir, `${slug(currentTestName)}.md`);
    writeFileSync(
      file,
      [
        `# ${currentTestName}`,
        '',
        `Generated from \`${relative(process.cwd(), testPath)}\` by \`npm run test:trace\`.`,
        '',
        '```mermaid',
        toSequenceDiagram(events, tracer.uiName),
        '```',
        '',
      ].join('\n'),
    );
  });
}

function slug(text: string): string {
  return text.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
}
