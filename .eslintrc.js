module.exports = {
  root: true,
  env: {
    node: true,
    es6: true
  },
  extends: ['eslint-config-egg'],
  rules: {
    'semi': 0,
    'comma-dangle': [1, 'always-multiline'],
    'array-bracket-spacing': [2, 'never'],
    'no-unused-vars': 'off'
  },
}
