/** A store state change, already summarized for display. */
export interface StateChange {
  path: string;
  /** Only kept when both sides are scalars, so the note can read `before → after`. */
  before?: string;
  /** Absent when the key was removed. */
  after?: string;
  added?: boolean;
}

export type TraceEvent =
  /** `key` identifies the control and gesture, so repeated keystrokes can be merged. */
  | { kind: 'user'; to: string; text: string; key: string }
  | { kind: 'call'; from: string; to: string; label: string }
  | { kind: 'return'; from: string; to: string; label: string }
  | { kind: 'throw'; from: string; to: string; label: string }
  | { kind: 'note'; over: string; changes: StateChange[] };

/** What one test recorded. Written to `traces/<spec>/<test>.json`. */
export interface TraceFile {
  version: 1;
  /** Spec file path relative to the project, e.g. `src/app/.../form.integration.spec.ts`. */
  spec: string;
  /** Full Jest test name, including describe blocks. */
  test: string;
  /** Participant that stands for the components. */
  ui: string;
  events: TraceEvent[];
}

export function describeChange({ path, before, after, added }: StateChange): string {
  if (after === undefined) return `${path}: removed`;
  if (added) return `${path}: + ${after}`;
  return before === undefined ? `${path}: ${after}` : `${path}: ${before} → ${after}`;
}
