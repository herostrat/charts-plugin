
import js from '@eslint/js';
import tsPlugin from '@typescript-eslint/eslint-plugin';
import tsParser from '@typescript-eslint/parser';
import globals from 'globals';
import prettier from 'eslint-config-prettier';

const baseLanguageOptions = {
  ecmaVersion: 'latest',
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
    files: ['scripts/**/*.{js,ts}', 'test/**/*.{js,ts,mjs}'],
    languageOptions: {
      ...baseLanguageOptions,
      globals: {
        ...globals.node,
        ...globals.mocha
      }
    },
    rules: {
      ...js.configs.recommended.rules
    }
  },
  {
    files: ['public/**/*.{js,ts}'],
    languageOptions: {
      ...baseLanguageOptions,
      globals: globals.browser
    },
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
  {
    files: ['scripts/**/*.ts', 'test/**/*.ts', 'public/**/*.ts'],
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
  {
    files: ['test/**/*.{js,ts,mjs}'],
    plugins: {
      '@typescript-eslint': tsPlugin
    },
    rules: {
      '@typescript-eslint/no-unused-vars': [
        'error',
        { argsIgnorePattern: '^_', varsIgnorePattern: '^_' }
      ],
      'no-unused-vars': ['error', { argsIgnorePattern: '^_', varsIgnorePattern: '^_' }],
      'no-empty': ['error', { allowEmptyCatch: true }],
      'no-unreachable': 'off'
    }
  },
  {
    files: ['test/@types/**/*.d.ts'],
    rules: {
      '@typescript-eslint/no-explicit-any': 'off',
      '@typescript-eslint/no-unused-vars': 'off',
      'no-unused-vars': 'off'
    }
  },
  prettier
]