module.exports = {
    root: true,
    extends: [
        'eslint:recommended',
        'plugin:@typescript-eslint/recommended',
    ],
    parser: '@typescript-eslint/parser',
    plugins: ['@typescript-eslint'],
    parserOptions: {
        ecmaVersion: 'latest',
        sourceType: 'module',
    },
    env: {
        es2022: true,
        node: true,
    },
    ignorePatterns: [
        'node_modules',
        '.expo',
        'dist',
        'build',
    ],
    rules: {
        // TypeScript
        '@typescript-eslint/no-unused-vars': ['error', { argsIgnorePattern: '^_' }],
        '@typescript-eslint/no-explicit-any': 'warn',
        '@typescript-eslint/consistent-type-imports': 'error',

        // Import boundaries will be enforced via overrides
    },
    overrides: [
        // Screens cannot use StyleSheet.create (must use @crux/ui)
        {
            files: ['apps/mobile/app/**/*.tsx', 'apps/mobile/src/features/**/*.tsx'],
            rules: {
                'no-restricted-imports': [
                    'error',
                    {
                        paths: [
                            {
                                name: 'react-native',
                                importNames: ['StyleSheet'],
                                message: 'Use @crux/ui components instead of StyleSheet.create in screens.',
                            },
                        ],
                        patterns: [
                            {
                                group: ['@crux/theme/src/tokens/colors*', '**/tokens/colors*'],
                                message: 'Screens cannot import raw colors. Use semantic theme colors via @crux/ui.',
                            },
                        ],
                    },
                ],
            },
        },
        // packages/ui CAN use StyleSheet for edge cases
        {
            files: ['packages/ui/**/*.tsx'],
            rules: {
                'no-restricted-imports': 'off',
            },
        },
    ],
};
