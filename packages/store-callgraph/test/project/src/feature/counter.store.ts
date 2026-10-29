import { inject } from '@angular/core';
import { patchState, signalStore, withHooks, withMethods, withState } from '@ngrx/signals';
import { CLOCK, formatCount, Logger } from '../shared/tokens';

export const CounterStore = signalStore(
  withState({ count: 0, updatedAt: 0 }),
  withMethods((store, clock = inject(CLOCK), logger = inject(Logger)) => {
    function stamp() {
      patchState(store, { updatedAt: clock.now() });
    }
    return {
      increment(by = 1): void {
        patchState(store, (s) => ({ count: s.count + by }));
        stamp();
        logger.log(formatCount(store.count()));
      },
      reset(): void {
        patchState(store, { count: 0 });
        stamp();
      },
      each(callback: (n: number) => void): void {
        callback(store.count());
      },
    };
  }),
  withHooks({
    onInit(store) {
      store.reset();
    },
  }),
);
