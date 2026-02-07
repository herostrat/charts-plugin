const js = require('@eslint/js')
const tsPlugin = require('@typescript-eslint/eslint-plugin')
const tsParser = require('@typescript-eslint/parser')
const globals = require('globals')
const prettier = require('eslint-config-prettier')

const baseLanguageOptions = {
  ecmaVersion: 2019,
  sourceType: 'module',
  globals: globals.node
}

module.exports = [
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