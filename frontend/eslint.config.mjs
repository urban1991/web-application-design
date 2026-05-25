// import js from "@eslint/js";
// import globals from "globals";
// import tseslint from "typescript-eslint";
// import pluginReact from "eslint-plugin-react";
// import { defineConfig } from "eslint/config";
//
// export default defineConfig([
//   { files: ["**/*.{js,mjs,cjs,ts,mts,cts,jsx,tsx}"], plugins: { js }, extends: ["js/recommended"], languageOptions: { globals: globals.browser } },
//   { files: ["**/*.js"], languageOptions: { sourceType: "commonjs" } },
//   tseslint.configs.recommended,
//   pluginReact.configs.flat.recommended,
// ]);
import js from '@eslint/js'
import { defineConfig } from 'eslint/config'
import pluginImport from 'eslint-plugin-import'
import pluginJsxA11y from 'eslint-plugin-jsx-a11y'
import pluginPrettier from 'eslint-plugin-prettier'
import pluginReact from 'eslint-plugin-react'
import globals from 'globals'
import tseslint from 'typescript-eslint'

export default defineConfig([
    {
        files: ['**/*.{js,mjs,cjs,ts,mts,cts,jsx,tsx}'],
        plugins: { js },
        extends: ['js/recommended'],
        languageOptions: { globals: globals.browser },
    },
    { files: ['**/*.js'], languageOptions: { sourceType: 'commonjs', globals: globals.node } },
    tseslint.configs.recommended,
    pluginReact.configs.flat.recommended,

    {
        plugins: {
            prettier: pluginPrettier,
            import: pluginImport,
            'jsx-a11y': pluginJsxA11y,
        },
        settings: {
            react: {
                version: 'detect',
            },
        },
        rules: {
            'prettier/prettier': ['error'],
            'no-console': 'error',
            '@typescript-eslint/no-namespace': 'warn',
            'no-restricted-imports': ['error', 'lodash/get'],
            'prefer-template': 'error',
            'import/first': 'error',
            'import/order': [
                'error',
                {
                    groups: [
                        ['builtin', 'external'],
                        'internal',
                        ['parent', 'sibling', 'index'],
                        'object',
                        'type',
                    ],
                    pathGroups: [
                        {
                            pattern: '@/**',
                            group: 'internal',
                            position: 'before',
                        },
                    ],
                    pathGroupsExcludedImportTypes: ['builtin', 'external'],
                    alphabetize: { order: 'asc', caseInsensitive: true },
                    'newlines-between': 'never',
                },
            ],
            'object-shorthand': ['error', 'always'],
            'no-nested-ternary': 'warn',
            'no-else-return': ['error', { allowElseIf: true }],
            '@typescript-eslint/ban-types': 'off',
            eqeqeq: 'error',
            'import/no-unresolved': 'off',
            'jsx-a11y/no-static-element-interactions': 'warn',
            'jsx-a11y/click-events-have-key-events': 'warn',
        },
    },
])
