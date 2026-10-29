import { Component, effect, inject, input, output } from '@angular/core';
import { CounterStore } from './counter.store';

@Component({
  selector: 'app-counter-button',
  template: `<button (click)="pressed.emit()">{{ label() }}</button>`,
})
export class CounterButtonComponent {
  readonly label = input('');
  readonly pressed = output<void>();
}

@Component({
  selector: 'app-counter',
  imports: [CounterButtonComponent],
  providers: [CounterStore],
  template: `
    <p>{{ store.count() }}</p>
    <app-counter-button label="Add" (pressed)="store.increment()" />
    <app-counter-button label="Reset" (pressed)="onReset()" />
  `,
})
export class CounterComponent {
  protected readonly store = inject(CounterStore);
  protected readonly logOnChange = effect(() => console.debug(this.store.count()));

  protected onReset(): void {
    this.store.reset();
  }
}

@Component({ selector: 'app-legacy', templateUrl: './legacy.html' })
export class LegacyComponent {}
