import js from '@eslint/js';
import globals from 'globals';
import react from 'eslint-plugin-react';
import reactHooks from 'eslint-plugin-react-hooks';
import tseslint from '@typescript-eslint/eslint-plugin';
import tsParser from '@typescript-eslint/parser';

export default [
  // Base JS rules
  js.configs.recommended,
  {
    ignores: ['dist/**', 'node_modules/**', 'coverage/**', 'test-results/**', 'playwright-report/**', '*.config.ts', '*.config.js', '*.config.mjs', 'test-*.js', 'test-*.html'],
  },

  // TS / TSX
  {
    files: ['**/*.ts', '**/*.tsx'],
    languageOptions: {
      parser: tsParser,
      parserOptions: {
        ecmaVersion: 'latest',
        sourceType: 'module',
        ecmaFeatures: { jsx: true },
      },
      globals: globals.browser,
    },
    plugins: {
      react,
      'react-hooks': reactHooks,
      '@typescript-eslint': tseslint,
    },
    settings: {
      react: { version: 'detect' },
    },
    rules: {
      'no-undef': 'off',
      'no-unused-vars': 'off',
      // React 17+
      'react/react-in-jsx-scope': 'off',
      'react/jsx-uses-react': 'off',

      // Hooks
      'react-hooks/rules-of-hooks': 'error',
      'react-hooks/exhaustive-deps': 'warn',

      // TS
      '@typescript-eslint/no-unused-vars': ['error', { argsIgnorePattern: '^_', varsIgnorePattern: '^_' }],
      '@typescript-eslint/no-explicit-any': 'warn',
    },
  },
  // Apply contracts.ts restriction only to non-API files
  {
    files: ['src/**/*.ts', 'src/**/*.tsx'],
    ignores: ['src/api/**/*.ts'],
    rules: {
      'no-restricted-imports': [
        'warn',
        {
          patterns: [
            {
              group: ['**/api/contracts'],
              message:
                'UI components should use domain types from api/types.ts, not raw API types from contracts.ts. Import contracts.ts only in API layer (api/*.ts files) or when rendering raw API lists (use eslint-disable comment).',
            },
          ],
        },
      ],
    },
  },
];
