module.exports = {
  modulePaths: ['<rootDir>/../node_modules'],
  preset: '@react-native/jest-preset',
  transformIgnorePatterns: ['node_modules/(?!((jest-)?react-native|@react-native(-community)?|react-native-image-picker|react-native-safe-area-context)/)'],
  setupFilesAfterEnv: ['<rootDir>/jest.setup.js'],
  moduleNameMapper: {'^@credflare/sdk-javascript$':'<rootDir>/../../sdk-javascript/src/index.ts'},
};
