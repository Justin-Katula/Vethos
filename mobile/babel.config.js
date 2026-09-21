// `react-native-reanimated` exige que son greffon soit le DERNIER de la liste.
module.exports = function (api) {
  api.cache(true)
  return {
    presets: [['babel-preset-expo', { jsxImportSource: 'react' }]],
    plugins: ['react-native-reanimated/plugin'],
  }
}
