import { Injectable, signal } from '@angular/core';

export interface Toast {
  kind: 'success' | 'error';
  message: string;
}

/** Host app toast service. */
@Injectable({ providedIn: 'root' })
export class Notifier {
  readonly toasts = signal<Toast[]>([]);

  success(message: string): void {
    this.toasts.update((t) => [...t, { kind: 'success', message }]);
  }

  error(message: string): void {
    this.toasts.update((t) => [...t, { kind: 'error', message }]);
  }
}
