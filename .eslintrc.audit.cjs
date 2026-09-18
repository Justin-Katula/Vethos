// Passe d'audit ponctuelle : les regles qui ont besoin des TYPES.
//
// La configuration courante n'active pas `parserOptions.project`, ce qui laisse
// dormir les regles les plus utiles pour un processus Electron — une promesse
// jamais attendue y echoue en silence, sans trace et sans plantage.
module.exports = {
  root: true,
  parser: '@typescript-eslint/parser',
  parserOptions: {
    ecmaVersion: 2022,
    sourceType: 'module',
    ecmaFeatures: { jsx: true },
    project: ['./tsconfig.node.json', './tsconfig.web.json'],
    tsconfigRootDir: __dirname,
  },
  // `react-hooks` est charge pour que les commentaires `eslint-disable` deja presents
  // dans le rendu resolvent leur regle au lieu de lever « rule not found ».
  plugins: ['@typescript-eslint', 'react-hooks'],
  rules: {
    '@typescript-eslint/no-floating-promises': 'error',
    '@typescript-eslint/no-misused-promises': 'error',
    '@typescript-eslint/await-thenable': 'error',
    '@typescript-eslint/no-unnecessary-condition': 'warn',
    '@typescript-eslint/no-for-in-array': 'error',
    '@typescript-eslint/no-array-delete': 'error',
    '@typescript-eslint/no-duplicate-type-constituents': 'warn',
    'no-constant-binary-expression': 'error',
    'no-self-compare': 'error',
    'no-unmodified-loop-condition': 'error',
    'no-unreachable-loop': 'error',
    'require-atomic-updates': 'error',
  },
}
