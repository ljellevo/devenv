import { defineConfig } from '@playwright/test';
export default defineConfig({ testDir: './tests/ui', use: { baseURL: 'http://devenv.test', viewport: { width: 1200, height: 820 } }, reporter: 'list' });
