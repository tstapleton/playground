import '@testing-library/jest-dom';
import { setupZonelessTestEnv } from 'jest-preset-angular/setup-env/zoneless';
import { installTraceHooks } from 'signal-trace/jest';

setupZonelessTestEnv();
installTraceHooks();
