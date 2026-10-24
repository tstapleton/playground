import { isSignal } from '@angular/core';
import { isObservable } from 'rxjs';

/** One-line, size-capped description of a value for a diagram label. */
export function summarize(value: unknown, depth = 0): string {
  if (value === undefined) return 'undefined';
  if (value === null) return 'null';
  if (typeof value === 'string') return JSON.stringify(truncate(value, 40));
  if (typeof value === 'number' || typeof value === 'boolean') return String(value);
  if (typeof value === 'function') return isSignal(value) ? 'Signal' : 'fn';
  if (isObservable(value)) return 'Observable';
  if (value instanceof Error) return `${value.name}: ${truncate(value.message, 40)}`;
  if (Array.isArray(value)) {
    if (depth > 0 || value.length > 3) return `[${value.length}]`;
    return `[${value.map((v) => summarize(v, depth + 1)).join(', ')}]`;
  }
  if (typeof value === 'object') {
    const entries = Object.entries(value);
    if (depth > 0) return entries.length ? `{…${entries.length}}` : '{}';
    // Keep whole entries and stop once the label gets long.
    const shown: string[] = [];
    for (const [k, v] of entries) {
      if (shown.join(', ').length > 45) {
        shown.push('…');
        break;
      }
      shown.push(`${k}: ${summarize(v, depth + 1)}`);
    }
    return `{${shown.join(', ')}}`;
  }
  return String(value);
}

export function summarizeArgs(args: unknown[]): string {
  return truncate(args.map((a) => summarize(a)).join(', '), 90);
}

export interface StateChange {
  path: string;
  before: unknown;
  after: unknown;
}

/** Changed keys, going one level into plain objects such as `values` or `touched`. */
export function diffState(prev: Record<string, unknown>, next: Record<string, unknown>): StateChange[] {
  const changes: StateChange[] = [];
  for (const key of Object.keys(next)) {
    const before = prev[key];
    const after = next[key];
    if (Object.is(before, after) || sameJson(before, after)) continue;
    if (isRecord(before) && Object.keys(before).length && isRecord(after) && !('id' in after)) {
      for (const sub of new Set([...Object.keys(before), ...Object.keys(after)])) {
        if (!Object.is(before[sub], after[sub])) changes.push({ path: `${key}.${sub}`, before: before[sub], after: after[sub] });
      }
    } else {
      changes.push({ path: key, before, after });
    }
  }
  return changes;
}

export function describeChange({ path, before, after }: StateChange): string {
  if (before === undefined) return `${path}: + ${summarize(after)}`;
  if (after === undefined) return `${path}: removed`;
  if (isScalar(before) && isScalar(after)) return `${path}: ${summarize(before)} → ${summarize(after)}`;
  return `${path}: ${summarize(after)}`;
}

/** A new but equal object (e.g. `{}` → `{}`) is not a change worth showing. */
function sameJson(a: unknown, b: unknown): boolean {
  return typeof a === 'object' && typeof b === 'object' && JSON.stringify(a) === JSON.stringify(b);
}

function isScalar(value: unknown): boolean {
  return value === null || ['string', 'number', 'boolean'].includes(typeof value);
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function truncate(text: string, max: number): string {
  return text.length > max ? `${text.slice(0, max - 1)}…` : text;
}
