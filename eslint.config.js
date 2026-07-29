const { defineConfig, globalIgnores } = require('eslint/config');
const typescriptEslint = require('@typescript-eslint/eslint-plugin');
const expoConfig = require('eslint-config-expo/flat');
const prettierRecommended = require('eslint-plugin-prettier/recommended');

module.exports = defineConfig([
  globalIgnores(['dist/**', 'coverage/**', 'ios/**', 'android/**', '.expo/**']),
  expoConfig,
  {
    plugins: { '@typescript-eslint': typescriptEslint },
    rules: {
      '@typescript-eslint/no-unused-vars': [
        'error',
        { argsIgnorePattern: '^_', varsIgnorePattern: '^Legacy' },
      ],
      'react-hooks/exhaustive-deps': 'off',
      'react-hooks/globals': 'off',
      'react-hooks/set-state-in-effect': 'off',
    },
  },
  prettierRecommended,
]);
