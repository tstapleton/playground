import { computed, inject } from '@angular/core';
import { patchState, signalStore, withComputed, withMethods, withState } from '@ngrx/signals';
import { rxMethod } from '@ngrx/signals/rxjs-interop';
import { EMPTY, catchError, exhaustMap, mergeMap, pipe, switchMap, tap } from 'rxjs';
import { FormApiClient, FormDefinitionDto, OptionDto, SectionDto } from '../../shared/api/form-api.client';
import { Notifier } from '../../shared/notifications/notifier';
import { withTracing } from 'signal-trace/store';
import { FieldErrors, FormValues, RulesEngine, allFields } from './rules-engine';

export type FormStatus = 'idle' | 'loading' | 'ready' | 'submitting' | 'submitted' | 'error';

interface DynamicFormState {
  formId: string | null;
  definition: FormDefinitionDto | null;
  status: FormStatus;
  values: FormValues;
  touched: Record<string, boolean>;
  submitAttempted: boolean;
  serverErrors: FieldErrors;
  remoteOptions: Record<string, OptionDto[]>;
  referenceId: string | null;
}

const initialState: DynamicFormState = {
  formId: null,
  definition: null,
  status: 'idle',
  values: {},
  touched: {},
  submitAttempted: false,
  serverErrors: {},
  remoteOptions: {},
  referenceId: null,
};

export const DynamicFormStore = signalStore(
  withState(initialState),
  withComputed((store, rules = inject(RulesEngine)) => {
    const clientErrors = computed(() => {
      const definition = store.definition();
      return definition ? rules.validate(definition, store.values()) : {};
    });
    return {
      clientErrors,
      visibleSections: computed<SectionDto[]>(() =>
        (store.definition()?.sections ?? [])
          .map((s) => ({ ...s, fields: s.fields.filter((f) => rules.isVisible(f, store.values())) }))
          .filter((s) => s.fields.length > 0),
      ),
      /** Errors the user should see: client errors once touched/submitted, plus server errors. */
      visibleErrors: computed<FieldErrors>(() => {
        const shown: FieldErrors = {};
        for (const [key, messages] of Object.entries(clientErrors())) {
          if (store.submitAttempted() || store.touched()[key]) shown[key] = messages;
        }
        return { ...shown, ...store.serverErrors() };
      }),
    };
  }),
  withMethods((store, api = inject(FormApiClient), notifier = inject(Notifier), rules = inject(RulesEngine)) => {
    const loadOptions = rxMethod<{ fieldKey: string; source: string; parent: string }>(
      mergeMap(({ fieldKey, source, parent }) =>
        api.getOptions(source, parent).pipe(
          tap((options) => patchState(store, { remoteOptions: { ...store.remoteOptions(), [fieldKey]: options } })),
          catchError(() => {
            notifier.error('Could not load options');
            return EMPTY;
          }),
        ),
      ),
    );

    return {
      load: rxMethod<string>(
        pipe(
          tap((formId) => patchState(store, { formId, status: 'loading' })),
          switchMap((formId) =>
            api.getDefinition(formId).pipe(
              tap((definition) =>
                patchState(store, { definition, values: rules.initialValues(definition), status: 'ready' }),
              ),
              catchError(() => {
                patchState(store, { status: 'error' });
                notifier.error('This form could not be loaded');
                return EMPTY;
              }),
            ),
          ),
        ),
      ),

      setValue(key: string, value: unknown): void {
        const { [key]: _cleared, ...serverErrors } = store.serverErrors();
        patchState(store, { values: { ...store.values(), [key]: value }, serverErrors });

        // Dependent selects are reset and refetched when their parent changes.
        for (const field of allFields(store.definition()!)) {
          if (field.optionsSource?.dependsOn !== key) continue;
          patchState(store, { values: { ...store.values(), [field.key]: null } });
          if (value) loadOptions({ fieldKey: field.key, source: field.optionsSource.source, parent: String(value) });
        }
      },

      markTouched(key: string): void {
        if (!store.touched()[key]) patchState(store, { touched: { ...store.touched(), [key]: true } });
      },

      submit: rxMethod<void>(
        pipe(
          tap(() => patchState(store, { submitAttempted: true })),
          exhaustMap(() => {
            const invalid = Object.keys(rules.validate(store.definition()!, store.values()));
            if (invalid.length) {
              notifier.error(`Please fix ${invalid.length} field${invalid.length > 1 ? 's' : ''}`);
              return EMPTY;
            }
            patchState(store, { status: 'submitting' });
            return api.submit(store.formId()!, store.values()).pipe(
              tap((result) => {
                if (result.ok) {
                  patchState(store, { status: 'submitted', referenceId: result.referenceId });
                  notifier.success(`Submitted (${result.referenceId})`);
                } else {
                  patchState(store, { status: 'ready', serverErrors: result.fieldErrors });
                  notifier.error('The server rejected some answers');
                }
              }),
              catchError(() => {
                patchState(store, { status: 'ready' });
                notifier.error('Submission failed, please try again');
                return EMPTY;
              }),
            );
          }),
        ),
      ),
    };
  }),
  withTracing('Form store'),
);
