// @ts-check
import eslint from '@eslint/js';
import angular from 'angular-eslint';
import eslintPluginPrettierRecommended from 'eslint-plugin-prettier/recommended';
import globals from 'globals';
import tseslint from 'typescript-eslint';

const NO_PROCESS_ENV =
  'Read configuration through a validated namespace in src/config (ADR 0018), not process.env.';

// Any way of reaching the environment directly: `process.env`, a destructured
// `env`, or `env` imported from `node:process`.
const noProcessEnv = [
  "MemberExpression[object.name='process'][property.name='env']",
  "MemberExpression[object.name='process'][property.value='env']",
  "VariableDeclarator[init.name='process'] > ObjectPattern > Property[key.name='env']",
  "ImportDeclaration[source.value=/^(node:)?process$/] ImportSpecifier[imported.name='env']",
].map((selector) => ({ selector, message: NO_PROCESS_ENV }));

export default tseslint.config(
  {
    ignores: [
      '**/dist/**',
      '**/coverage/**',
      '**/.angular/**',
      '**/src/paraglide/**',
    ],
  },
  {
    files: ['apps/api/**/*.ts'],
    extends: [
      eslint.configs.recommended,
      ...tseslint.configs.recommendedTypeChecked,
      eslintPluginPrettierRecommended,
    ],
    languageOptions: {
      globals: {
        ...globals.node,
      },
      sourceType: 'commonjs',
      parserOptions: {
        projectService: true,
        tsconfigRootDir: import.meta.dirname,
      },
    },
    rules: {
      '@typescript-eslint/no-explicit-any': 'off',
      '@typescript-eslint/no-floating-promises': 'warn',
      '@typescript-eslint/no-unsafe-argument': 'warn',
      'prettier/prettier': ['error', { endOfLine: 'auto' }],
      'no-restricted-syntax': ['error', ...noProcessEnv],
    },
  },
  {
    // Configuration is read once, validated, in the config module. Tests set
    // their own environment.
    files: [
      'apps/api/src/config/**/*.ts',
      'apps/api/test/**/*.ts',
      'apps/api/**/*.spec.ts',
      'apps/api/**/*.e2e-spec.ts',
    ],
    rules: { 'no-restricted-syntax': 'off' },
  },
  {
    files: ['apps/web/**/*.ts'],
    extends: [
      eslint.configs.recommended,
      ...tseslint.configs.recommended,
      ...angular.configs.tsRecommended,
      eslintPluginPrettierRecommended,
    ],
    processor: angular.processInlineTemplates,
    languageOptions: {
      parserOptions: {
        projectService: true,
        tsconfigRootDir: import.meta.dirname,
      },
    },
    rules: {
      '@angular-eslint/directive-selector': [
        'error',
        { type: 'attribute', prefix: 'app', style: 'camelCase' },
      ],
      '@angular-eslint/component-selector': [
        'error',
        { type: 'element', prefix: 'app', style: 'kebab-case' },
      ],
      'prettier/prettier': ['error', { endOfLine: 'auto' }],
    },
  },
  {
    files: ['apps/web/**/*.html'],
    extends: [
      ...angular.configs.templateRecommended,
      ...angular.configs.templateAccessibility,
    ],
    rules: {},
  },
);
