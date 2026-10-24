import { HttpClient } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { Observable } from 'rxjs';

export type FieldType = 'text' | 'number' | 'select' | 'checkbox';

export interface OptionDto {
  value: string;
  label: string;
}

export interface FieldDto {
  key: string;
  label: string;
  type: FieldType;
  required?: boolean;
  min?: number;
  max?: number;
  pattern?: string;
  patternMessage?: string;
  /** Static options for a select. */
  options?: OptionDto[];
  /** Options fetched from the backend whenever `dependsOn` changes. */
  optionsSource?: { source: string; dependsOn: string };
  /** Only shown (and validated) while another field has this value. */
  visibleWhen?: { field: string; equals: unknown };
}

export interface SectionDto {
  id: string;
  title: string;
  fields: FieldDto[];
}

export interface FormDefinitionDto {
  id: string;
  title: string;
  submitLabel: string;
  sections: SectionDto[];
}

export type SubmitResultDto =
  | { ok: true; referenceId: string }
  | { ok: false; fieldErrors: Record<string, string[]> };

/** Backend client owned by the host app. The feature only consumes it. */
@Injectable({ providedIn: 'root' })
export class FormApiClient {
  private readonly http = inject(HttpClient);

  getDefinition(formId: string): Observable<FormDefinitionDto> {
    return this.http.get<FormDefinitionDto>(`/api/forms/${formId}`);
  }

  getOptions(source: string, parent: string): Observable<OptionDto[]> {
    return this.http.get<OptionDto[]>(`/api/options/${source}`, { params: { parent } });
  }

  submit(formId: string, values: Record<string, unknown>): Observable<SubmitResultDto> {
    return this.http.post<SubmitResultDto>(`/api/forms/${formId}/submissions`, values);
  }
}
