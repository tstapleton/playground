import { InjectionToken } from '@angular/core';

export interface Clock {
  now(): number;
}

/** Provided by the host app. */
export const CLOCK = new InjectionToken<Clock>('CLOCK');

export abstract class Logger {
  abstract log(message: string): void;
}

export function formatCount(count: number): string {
  return `${count} items`;
}
