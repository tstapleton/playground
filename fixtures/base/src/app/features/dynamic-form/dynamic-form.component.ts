import { ChangeDetectionStrategy, Component, OnInit, inject, input } from '@angular/core';
import { FieldDto, OptionDto } from '../../shared/api/form-api.client';
import { DynamicFormStore } from './dynamic-form.store';
import { FieldComponent } from './field.component';

/** Renders a form whose fields, rules and sections come from backend configuration. */
@Component({
  selector: 'app-dynamic-form',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [FieldComponent],
  providers: [DynamicFormStore],
  template: `
    @switch (store.status()) {
      @case ('loading') {
        <p role="status">Loading form…</p>
      }
      @case ('error') {
        <p role="alert">This form is unavailable.</p>
      }
      @case ('submitted') {
        <p role="status">Thanks! Your reference is {{ store.referenceId() }}.</p>
      }
    }

    @if (store.definition(); as definition) {
      @if (store.status() !== 'submitted') {
        <form [attr.aria-label]="definition.title" novalidate (submit)="onSubmit($event)">
          <h1>{{ definition.title }}</h1>
          @for (section of store.visibleSections(); track section.id) {
            <fieldset>
              <legend>{{ section.title }}</legend>
              @for (field of section.fields; track field.key) {
                <app-field
                  [field]="field"
                  [value]="store.values()[field.key]"
                  [options]="optionsFor(field)"
                  [error]="store.visibleErrors()[field.key]?.[0]"
                  (valueChange)="store.setValue(field.key, $event)"
                  (blurred)="store.markTouched(field.key)"
                />
              }
            </fieldset>
          }
          <button type="submit" [disabled]="store.status() === 'submitting'">
            {{ store.status() === 'submitting' ? 'Submitting…' : definition.submitLabel }}
          </button>
        </form>
      }
    }
  `,
})
export class DynamicFormComponent implements OnInit {
  readonly formId = input.required<string>();
  protected readonly store = inject(DynamicFormStore);

  ngOnInit(): void {
    this.store.load(this.formId());
  }

  protected optionsFor(field: FieldDto): OptionDto[] {
    return field.options ?? this.store.remoteOptions()[field.key] ?? [];
  }

  protected onSubmit(event: Event): void {
    event.preventDefault();
    this.store.submit();
  }
}
