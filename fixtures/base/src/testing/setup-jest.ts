import '@testing-library/jest-dom';
import { setupZonelessTestEnv } from 'jest-preset-angular/setup-env/zoneless';
import { installTraceHooks } from './trace/jest-hooks';

setupZonelessTestEnv();
installTraceHooks();
