// @ts-check
import js from '@eslint/js'
import tsPlugin from '@typescript-eslint/eslint-plugin'
import tsParser from '@typescript-eslint/parser'
import prettierConfig from 'eslint-config-prettier'

export default [
    // ignore non-backend directories
    {
        ignores: ['dist/**', 'frontend/**', 'node_modules/**', 'tools/**'],
    },

    // base JS rules
    js.configs.recommended,

    // TypeScript rules for src/
    {
        files: ['src/**/*.ts'],
        languageOptions: {
            parser: tsParser,
            parserOptions: {
                project: './tsconfig.json',
            },
        },
        plugins: {
            '@typescript-eslint': tsPlugin,
        },
        rules: {
            // TypeScript recommended
            ...tsPlugin.configs.recommended.rules,

            // TypeScript handles undefined checks better than ESLint
            'no-undef': 'off',
            // Empty catch blocks are sometimes intentional (best-effort try/catch)
            'no-empty': ['error', { allowEmptyCatch: true }],

            // Catch common Node/Express pitfalls
            '@typescript-eslint/no-explicit-any': 'warn',
            '@typescript-eslint/no-unused-vars': ['error', { argsIgnorePattern: '^_' }],
            '@typescript-eslint/explicit-function-return-type': 'off',
            '@typescript-eslint/no-floating-promises': 'error',
            'no-console': ['warn', { allow: ['error', 'warn', 'log', 'info'] }],
            'eqeqeq': ['error', 'always'],
        },
    },

    // TypeScript rules for tests/ (no project needed — tests not in tsconfig.json)
    {
        files: ['tests/**/*.ts'],
        languageOptions: {
            parser: tsParser,
        },
        plugins: {
            '@typescript-eslint': tsPlugin,
        },
        rules: {
            ...tsPlugin.configs.recommended.rules,
            'no-undef': 'off',
            'no-empty': ['error', { allowEmptyCatch: true }],
            '@typescript-eslint/no-explicit-any': 'off',
            '@typescript-eslint/no-unused-vars': ['error', { argsIgnorePattern: '^_' }],
            '@typescript-eslint/no-floating-promises': 'off',
            'no-console': 'off',
        },
    },

    // disable formatting rules (Prettier handles those)
    prettierConfig,
]
