#!/usr/bin/env node
// Runs the TypeScript CLI directly; the package ships sources, not a build.
import { tsImport } from 'tsx/esm/api';

await tsImport('../src/cli.ts', import.meta.url);
