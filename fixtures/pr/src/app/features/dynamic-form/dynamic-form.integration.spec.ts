import { render, screen } from '@testing-library/angular';
import userEvent from '@testing-library/user-event';
import { Observable, map, timer } from 'rxjs';
import { Analytics } from '../../shared/analytics/analytics';
import { FormApiClient, FormDefinitionDto, OptionDto, SubmitResultDto } from '../../shared/api/form-api.client';
import { Notifier } from '../../shared/notifications/notifier';
import { provideTracing, traced } from 'signal-trace/jest';
import { DynamicFormComponent } from './dynamic-form.component';
import { RulesEngine } from './rules-engine';

const vendorOnboarding: FormDefinitionDto = {
  id: 'vendor-onboarding',
  title: 'Vendor onboarding',
  submitLabel: 'Send for approval',
  sections: [
    {
      id: 'company',
      title: 'Company',
      fields: [
        { key: 'companyName', label: 'Company name', type: 'text', required: true },
        {
          key: 'companyType',
          label: 'Company type',
          type: 'select',
          required: true,
          options: [
            { value: 'sole', label: 'Sole trader' },
            { value: 'limited', label: 'Limited company' },
          ],
        },
        {
          key: 'registrationNumber',
          label: 'Registration number',
          type: 'text',
          required: true,
          pattern: '^\\d{8}$',
          patternMessage: 'Must be 8 digits',
          visibleWhen: { field: 'companyType', equals: 'limited' },
        },
      ],
    },
    {
      id: 'address',
      title: 'Address',
      fields: [
        {
          key: 'country',
          label: 'Country',
          type: 'select',
          required: true,
          options: [
            { value: 'GB', label: 'United Kingdom' },
            { value: 'US', label: 'United States' },
          ],
        },
        { key: 'region', label: 'Region', type: 'select', required: true, optionsSource: { source: 'regions', dependsOn: 'country' } },
      ],
    },
    {
      id: 'terms',
      title: 'Terms',
      fields: [
        { key: 'paymentDays', label: 'Payment terms (days)', type: 'number', min: 0, max: 90 },
        { key: 'acceptsTerms', label: 'I accept the supplier terms', type: 'checkbox', required: true },
      ],
    },
  ],
};

const regions: Record<string, OptionDto[]> = {
  GB: [
    { value: 'ENG', label: 'England' },
    { value: 'SCT', label: 'Scotland' },
  ],
  US: [{ value: 'CA', label: 'California' }],
};

// Diagram boxes: the feature under test, and the mocked host app around it.
const FEATURE = 'Dynamic form feature';
const HOST_APP = 'Host app (mocked)';

/** Responds like a real backend would: later, not synchronously. */
function respond<T>(value: T): Observable<T> {
  return timer(5).pipe(map(() => value));
}

async function setup(overrides: Partial<Record<keyof FormApiClient, jest.Mock>> = {}) {
  const api = {
    getDefinition: jest.fn(() => respond(vendorOnboarding)),
    getOptions: jest.fn((_source: string, { parent }: { parent: string }) => respond(regions[parent] ?? [])),
    submit: jest.fn((): Observable<SubmitResultDto> => respond({ ok: true, referenceId: 'VND-1042' })),
    ...overrides,
  };
  const notifier = { success: jest.fn(), error: jest.fn() };
  const analytics = { track: jest.fn() };

  await render(DynamicFormComponent, {
    inputs: { formId: 'vendor-onboarding' },
    providers: [
      // Everything outside the feature directory is mocked; `traced` names it in diagrams.
      traced('Form API', { provide: FormApiClient, useValue: api }, { group: HOST_APP }),
      traced('Notifier', { provide: Notifier, useValue: notifier }, { group: HOST_APP }),
      traced('Analytics', { provide: Analytics, useValue: analytics }, { group: HOST_APP }),
      traced('Rules engine', RulesEngine, { methods: ['validate'], group: FEATURE }),
      provideTracing({ ui: 'UI', group: FEATURE }),
    ],
  });
  await screen.findByRole('heading', { name: 'Vendor onboarding' });

  return { api, notifier, analytics, user: userEvent.setup() };
}

async function fillValidForm(user: ReturnType<typeof userEvent.setup>) {
  await user.type(screen.getByLabelText('Company name'), 'Acme');
  await user.selectOptions(screen.getByLabelText('Company type'), 'Sole trader');
  await user.selectOptions(screen.getByLabelText('Country'), 'United Kingdom');
  await user.selectOptions(screen.getByLabelText('Region'), await screen.findByRole('option', { name: 'Scotland' }));
  await user.click(screen.getByLabelText('I accept the supplier terms'));
}

describe('Dynamic form', () => {
  it('loads the form definition from the backend and renders its sections', async () => {
    const { api } = await setup();

    expect(api.getDefinition).toHaveBeenCalledWith('vendor-onboarding');
    expect(screen.getByRole('group', { name: 'Company' })).toBeInTheDocument();
    expect(screen.getByRole('group', { name: 'Address' })).toBeInTheDocument();
    expect(screen.queryByLabelText('Registration number')).not.toBeInTheDocument();
  });

  it('shows and validates the registration number only for limited companies', async () => {
    const { user } = await setup();

    await user.selectOptions(screen.getByLabelText('Company type'), 'Limited company');
    await user.type(screen.getByLabelText('Registration number'), '123');
    await user.tab();

    expect(screen.getByText('Must be 8 digits')).toBeInTheDocument();
  });

  it('loads regions for the selected country', async () => {
    const { api, user } = await setup();

    await user.selectOptions(screen.getByLabelText('Country'), 'United States');

    expect(await screen.findByRole('option', { name: 'California' })).toBeInTheDocument();
    expect(api.getOptions).toHaveBeenCalledWith('regions', { parent: 'US', locale: 'en-US' });
  });

  it('blocks submission while required fields are missing', async () => {
    const { api, notifier, user } = await setup();

    await user.type(screen.getByLabelText('Company name'), 'Acme');
    await user.click(screen.getByRole('button', { name: 'Send for approval' }));

    expect(notifier.error).toHaveBeenCalledWith('Please fix 4 fields');
    expect(screen.getByText('Country is required')).toBeInTheDocument();
    expect(api.submit).not.toHaveBeenCalled();
  });

  it('shows field errors returned by the server', async () => {
    const { user } = await setup({
      submit: jest.fn(() => respond({ ok: false, fieldErrors: { companyName: ['Already registered'] } })),
    });

    await fillValidForm(user);
    await user.click(screen.getByRole('button', { name: 'Send for approval' }));

    expect(await screen.findByText('Already registered')).toBeInTheDocument();
  });

  it('submits a valid form and shows the reference', async () => {
    const { api, notifier, analytics, user } = await setup();

    await fillValidForm(user);
    await user.click(screen.getByRole('button', { name: 'Send for approval' }));

    expect(await screen.findByText('Thanks! Your reference is VND-1042.')).toBeInTheDocument();
    expect(api.submit).toHaveBeenCalledWith('vendor-onboarding', expect.objectContaining({ companyName: 'Acme', region: 'SCT' }));
    expect(notifier.success).toHaveBeenCalledWith('Submitted (VND-1042)');
    expect(analytics.track).toHaveBeenCalledWith('form_submitted', { formId: 'vendor-onboarding', referenceId: 'VND-1042' });
  });

  it('tells the user when the form cannot be loaded', async () => {
    const notifier = { success: jest.fn(), error: jest.fn() };
    await render(DynamicFormComponent, {
      inputs: { formId: 'vendor-onboarding' },
      providers: [
        traced(
          'Form API',
          {
            provide: FormApiClient,
            useValue: { getDefinition: () => timer(5).pipe(map(() => { throw new Error('503 Service Unavailable'); })) },
          },
          { group: HOST_APP },
        ),
        traced('Notifier', { provide: Notifier, useValue: notifier }, { group: HOST_APP }),
        provideTracing({ ui: 'UI', group: FEATURE }),
      ],
    });

    expect(await screen.findByRole('alert')).toHaveTextContent('This form is unavailable.');
    expect(notifier.error).toHaveBeenCalledWith('This form could not be loaded');
  });
});

