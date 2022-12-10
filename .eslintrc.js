module.exports = {
  parser: '@typescript-eslint/parser',
  parserOptions: {
    ecmaVersion: 2021,
    sourceType: 'module'
  },
  extends: ['eslint:recommended', 'plugin:@typescript-eslint/recommended', 'plugin:jest/recommended', 'prettier'],
  plugins: ['@typescript-eslint', 'prettier'],
  env: { node: true },
  rules: {
    'prettier/prettier': 'error',
    'no-param-reassign': 'error',
    eqeqeq: ['error', 'always'],
    'no-useless-escape': 'off',
    '@typescript-eslint/no-explicit-any': 'off',
    '@typescript-eslint/no-non-null-assertion': 'off',
    '@typescript-eslint/no-inferrable-types': 'off',
    '@typescript-eslint/explicit-module-boundary-types': 'off'
  },
  overrides: [
    {
      files: '**/*.js',
      rules: {
        '@typescript-eslint/no-var-requires': 'off'
      }
    },
    {
      files: 'test/**/*.test.ts',
      rules: {
        '@typescript-eslint/no-var-requires': 'off',
        'no-empty': ['error', { allowEmptyCatch: true }]
      }
    }
  ]
};
