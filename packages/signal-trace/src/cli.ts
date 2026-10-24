import { mkdirSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { loadTraces } from './report/load';
import { reportPage } from './report/report';

const USAGE = `Usage:
  signal-trace report <trace-dir> [--out <dir>]   Render every trace to <dir>/index.html`;

function main(argv: string[]): number {
  const [command, ...rest] = argv;
  const positional = rest.filter((a, i) => !a.startsWith('--') && !rest[i - 1]?.startsWith('--'));
  const flag = (name: string) => {
    const i = rest.indexOf(`--${name}`);
    return i >= 0 ? rest[i + 1] : undefined;
  };

  if (command === 'report' && positional.length === 1) {
    const out = resolve(flag('out') ?? join(positional[0], 'report'));
    mkdirSync(out, { recursive: true });
    const traces = loadTraces(resolve(positional[0]));
    writeFileSync(join(out, 'index.html'), reportPage(traces));
    console.log(`Rendered ${traces.length} traces to ${join(out, 'index.html')}`);
    return 0;
  }

  console.error(USAGE);
  return 1;
}

process.exitCode = main(process.argv.slice(2));
