import { ChangeDetectionStrategy, Component, computed, input, output } from '@angular/core';
import { FieldDto, OptionDto } from '../../shared/api/form-api.client';

@Component({
  selector: 'app-field',
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    @let f = field();
    <div class="field" [class.invalid]="error()">
      @switch (f.type) {
        @case ('checkbox') {
          <label>
            <input
              type="checkbox"
              [id]="id()"
              [checked]="value() === true"
              [attr.aria-invalid]="!!error()"
              [attr.aria-describedby]="error() ? errorId() : null"
              (change)="valueChange.emit($any($event.target).checked)"
              (blur)="blurred.emit()"
            />
            {{ f.label }}
          </label>
        }
        @case ('select') {
          <label [for]="id()">{{ f.label }}</label>
          <select
            [id]="id()"
            [attr.aria-invalid]="!!error()"
            [attr.aria-describedby]="error() ? errorId() : null"
            (change)="valueChange.emit($any($event.target).value || null)"
            (blur)="blurred.emit()"
          >
            <option value="" [selected]="value() === null">Select…</option>
            @for (option of options(); track option.value) {
              <option [value]="option.value" [selected]="option.value === value()">{{ option.label }}</option>
            }
          </select>
        }
        @default {
          <label [for]="id()">{{ f.label }}</label>
          <input
            [id]="id()"
            [type]="f.type"
            [value]="value() ?? ''"
            [attr.aria-invalid]="!!error()"
            [attr.aria-describedby]="error() ? errorId() : null"
            (input)="onInput($any($event.target))"
            (blur)="blurred.emit()"
          />
        }
      }
      @if (error(); as message) {
        <p class="error" [id]="errorId()">{{ message }}</p>
      }
    </div>
  `,
})
export class FieldComponent {
  readonly field = input.required<FieldDto>();
  readonly value = input<unknown>(null);
  readonly options = input<OptionDto[]>([]);
  readonly error = input<string | undefined>();

  readonly valueChange = output<unknown>();
  readonly blurred = output<void>();

  protected readonly id = computed(() => `field-${this.field().key}`);
  protected readonly errorId = computed(() => `${this.id()}-error`);

  protected onInput(target: HTMLInputElement): void {
    if (this.field().type === 'number') {
      this.valueChange.emit(target.value === '' ? null : target.valueAsNumber);
    } else {
      this.valueChange.emit(target.value);
    }
  }
}
