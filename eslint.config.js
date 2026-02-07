
import js from '@eslint/js';
import tsPlugin from '@typescript-eslint/eslint-plugin';
import tsParser from '@typescript-eslint/parser';
import globals from 'globals';
import prettier from 'eslint-config-prettier';

const baseLanguageOptions = {
  ecmaVersion: 2019,
  sourceType: 'module',
  globals: globals.node
}

export default [
  {
    files: ['src/**/*.{js,ts}'],
    languageOptions: baseLanguageOptions,
    rules: {
      ...js.configs.recommended.rules
    }
  },
  {
    files: ['src/**/*.ts'],
    languageOptions: {
      ...baseLanguageOptions,
      parser: tsParser
    },
    plugins: {
      '@typescript-eslint': tsPlugin
    },
    rules: {
      ...tsPlugin.configs.recommended.rules,
      'no-undef': 'off'
    }
  },
  prettier
]