module.exports = {
  modulePaths: ['<rootDir>/../node_modules'],
  preset: '@react-native/jest-preset',
  transformIgnorePatterns: [
    'node_modules/(?!((jest-)?react-native|@react-native(-community)?|@react-native-documents|react-native-image-picker|react-native-safe-area-context)/)',
  ],
  setupFilesAfterEnv: ['<rootDir>/jest.setup.js'],
  moduleNameMapper: {
    '^\\./(index|workflow|capture|copy|settings|engine|faces|location|liveness|spec\\.generated)\\.js$':
      '<rootDir>/../../javascript-sdk/src/$1.ts',
    '^@credflare/sdk-javascript$':
      '<rootDir>/../../javascript-sdk/src/index.ts',
  },
};
