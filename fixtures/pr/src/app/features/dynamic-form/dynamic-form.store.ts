import { computed, inject } from '@angular/core';
import { patchState, signalStore, withComputed, withMethods, withState } from '@ngrx/signals';
import { rxMethod } from '@ngrx/signals/rxjs-interop';
import { EMPTY, catchError, defer, exhaustMap, mergeMap, pipe, retry, switchMap, tap } from 'rxjs';
import { Analytics } from '../../shared/analytics/analytics';
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
  /** Last validation result; refreshed on blur and submit rather than on every keystroke. */
  clientErrors: FieldErrors;
  serverErrors: FieldErrors;
  remoteOptions: Record<string, OptionDto[]>;
  /** Registry checks, keyed by field; `value` is what was checked. */
  verifications: Record<string, Verification>;
  referenceId: string | null;
}

export interface Verification {
  value: string;
  status: 'checking' | 'valid' | 'invalid';
  detail?: string;
}

const initialState: DynamicFormState = {
  formId: null,
  definition: null,
  status: 'idle',
  values: {},
  touched: {},
  submitAttempted: false,
  clientErrors: {},
  serverErrors: {},
  remoteOptions: {},
  verifications: {},
  referenceId: null,
};

export const DynamicFormStore = signalStore(
  withState(initialState),
  withComputed((store, rules = inject(RulesEngine)) => {
    return {
      visibleSections: computed<SectionDto[]>(() =>
        (store.definition()?.sections ?? [])
          .map((s) => ({ ...s, fields: s.fields.filter((f) => rules.isVisible(f, store.values())) }))
          .filter((s) => s.fields.length > 0),
      ),
      /** Errors the user should see: client errors once touched/submitted, plus server errors. */
      visibleErrors: computed<FieldErrors>(() => {
        const shown: FieldErrors = {};
        for (const [key, messages] of Object.entries(store.clientErrors())) {
          if (store.submitAttempted() || store.touched()[key]) shown[key] = messages;
        }
        for (const [key, check] of Object.entries(store.verifications())) {
          if (check.status === 'invalid') shown[key] = ['Not found in the VAT registry'];
        }
        return { ...shown, ...store.serverErrors() };
      }),
    };
  }),
  withMethods((store, api = inject(FormApiClient), notifier = inject(Notifier), rules = inject(RulesEngine), analytics = inject(Analytics)) => {
    const revalidate = () => patchState(store, { clientErrors: rules.validate(store.definition()!, store.values()) });

    const setVerification = (key: string, verification: Verification) =>
      patchState(store, { verifications: { ...store.verifications(), [key]: verification } });

    const verifyVat = rxMethod<{ key: string; value: string }>(
      switchMap(({ key, value }) => {
        setVerification(key, { value, status: 'checking' });
        return api.verifyVat(value).pipe(
          tap((check) =>
            setVerification(key, check.valid ? { value, status: 'valid', detail: check.registeredName } : { value, status: 'invalid' }),
          ),
          catchError(() => {
            setVerification(key, { value, status: 'invalid', detail: 'Registry unavailable' });
            return EMPTY;
          }),
        );
      }),
    );

    const loadOptions = rxMethod<{ fieldKey: string; source: string; parent: string }>(
      mergeMap(({ fieldKey, source, parent }) =>
        api.getOptions(source, { parent, locale: navigator.language }).pipe(
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
            // One retry covers a backend that is briefly unavailable after a deploy.
            defer(() => api.getDefinition(formId)).pipe(
              retry({ count: 1, delay: 20 }),
              tap((definition) => {
                patchState(store, { definition, values: rules.initialValues(definition), status: 'ready' });
                analytics.track('form_viewed', { formId });
              }),
              catchError(() => {
                patchState(store, { status: 'error' });
                notifier.error('This form could not be loaded. Please refresh to try again.');
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

        // Once a field has been left, keep its error in step with what the user types.
        if (store.touched()[key] || store.submitAttempted()) revalidate();
      },

      markTouched(key: string): void {
        if (!store.touched()[key]) {
          patchState(store, { touched: { ...store.touched(), [key]: true } });
          revalidate();
        }

        const field = allFields(store.definition()!).find((f) => f.key === key);
        const value = store.values()[key];
        if (field?.verify === 'vat' && typeof value === 'string' && value && store.verifications()[key]?.value !== value) {
          verifyVat({ key, value });
        }
      },

      submit: rxMethod<void>(
        pipe(
          tap(() => patchState(store, { submitAttempted: true })),
          exhaustMap(() => {
            revalidate();
            const invalid = Object.keys(store.clientErrors());
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
                  analytics.track('form_submitted', { formId: store.formId(), referenceId: result.referenceId });
                } else {
                  patchState(store, { status: 'ready', serverErrors: result.fieldErrors });
                  notifier.error('The server rejected some answers');
                  analytics.track('form_rejected', { formId: store.formId(), fields: Object.keys(result.fieldErrors) });
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
