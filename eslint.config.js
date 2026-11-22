import js from '@eslint/js';
import tseslint from 'typescript-eslint';

export default tseslint.config(
  {
    ignores: [
      '**/dist/**',
      '**/node_modules/**',
      'apps/api/src/generated/**',
      'spikes/**',
      'apps/web/public/**',
      'apps/web/functions/**',
      'agent/**',
    ],
  },
  js.configs.recommended,
  ...tseslint.configs.recommended,
  {
    rules: {
      '@typescript-eslint/no-unused-vars': ['error', { argsIgnorePattern: '^_' }],
      '@typescript-eslint/consistent-type-imports': 'error',
      'no-console': 'error',
    },
  },
  {
    files: [
      '**/*.test.ts',
      '**/*.test.tsx',
      'apps/api/prisma/seed.ts',
      'apps/api/src/main.ts',
      'apps/api/test/**',
    ],
    rules: { 'no-console': 'off' },
  },
);
