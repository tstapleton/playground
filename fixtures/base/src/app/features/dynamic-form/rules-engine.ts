import { Injectable } from '@angular/core';
import { FieldDto, FormDefinitionDto } from '../../shared/api/form-api.client';

export type FormValues = Record<string, unknown>;
export type FieldErrors = Record<string, string[]>;

/** Evaluates the visibility and validation rules carried by a form definition. */
@Injectable({ providedIn: 'root' })
export class RulesEngine {
  initialValues(definition: FormDefinitionDto): FormValues {
    const values: FormValues = {};
    for (const field of allFields(definition)) {
      values[field.key] = field.type === 'checkbox' ? false : null;
    }
    return values;
  }

  isVisible(field: FieldDto, values: FormValues): boolean {
    return !field.visibleWhen || values[field.visibleWhen.field] === field.visibleWhen.equals;
  }

  validate(definition: FormDefinitionDto, values: FormValues): FieldErrors {
    const errors: FieldErrors = {};
    for (const field of allFields(definition)) {
      if (!this.isVisible(field, values)) continue;
      const fieldErrors = validateField(field, values[field.key]);
      if (fieldErrors.length) errors[field.key] = fieldErrors;
    }
    return errors;
  }
}

export function allFields(definition: FormDefinitionDto): FieldDto[] {
  return definition.sections.flatMap((s) => s.fields);
}

function validateField(field: FieldDto, value: unknown): string[] {
  const empty = value === null || value === '' || value === false;
  if (empty) return field.required ? [`${field.label} is required`] : [];

  const errors: string[] = [];
  if (typeof value === 'number') {
    if (field.min !== undefined && value < field.min) errors.push(`Minimum is ${field.min}`);
    if (field.max !== undefined && value > field.max) errors.push(`Maximum is ${field.max}`);
  }
  if (typeof value === 'string' && field.pattern && !new RegExp(field.pattern).test(value)) {
    errors.push(field.patternMessage ?? `${field.label} is invalid`);
  }
  return errors;
}
