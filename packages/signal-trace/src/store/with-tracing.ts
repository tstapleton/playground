import { InjectionToken, inject } from '@angular/core';
import { EmptyFeatureResult, SignalStoreFeature, SignalStoreFeatureResult } from '@ngrx/signals';

/**
 * Receives a store's internals while it is being built. Only provided by the test
 * harness (see src/testing/trace), so in the app `withTracing` is a no-op.
 */
export interface TraceSink {
  instrumentStore<T extends object>(name: string, innerStore: T): T;
}

export const TRACE_SINK = new InjectionToken<TraceSink>('TRACE_SINK');

/**
 * Marks a SignalStore as a participant in generated sequence diagrams.
 *
 * Place it after the features whose methods should be traced and before `withHooks`,
 * so that hooks call the traced methods.
 */
export function withTracing<Input extends SignalStoreFeatureResult>(
  name: string,
): SignalStoreFeature<Input, EmptyFeatureResult> {
  return (store) => {
    const sink = inject(TRACE_SINK, { optional: true });
    return sink ? sink.instrumentStore(name, store) : store;
  };
}
