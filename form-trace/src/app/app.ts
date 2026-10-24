import { Component } from '@angular/core';
import { DynamicFormComponent } from './features/dynamic-form/dynamic-form.component';

@Component({
  selector: 'app-root',
  imports: [DynamicFormComponent],
  template: `<app-dynamic-form formId="vendor-onboarding" />`,
})
export class App {}
