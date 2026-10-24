import { Injectable } from '@angular/core';

/** Host app product analytics. */
@Injectable({ providedIn: 'root' })
export class Analytics {
  track(event: string, properties: Record<string, unknown> = {}): void {
    console.debug('[analytics]', event, properties);
  }
}
