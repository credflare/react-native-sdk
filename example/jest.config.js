module.exports = {
  modulePaths: ['<rootDir>/../node_modules'],
  preset: '@react-native/jest-preset',
  transformIgnorePatterns: [
    'node_modules/(?!((jest-)?react-native|@react-native(-community)?|@react-native-documents|react-native-image-picker|react-native-safe-area-context)/)',
  ],
  setupFilesAfterEnv: ['<rootDir>/jest.setup.js'],
  moduleNameMapper: {
    '^\\./workflow\\.js$': '<rootDir>/../../javascript-sdk/src/workflow.ts',
    '^\\./capture\\.js$': '<rootDir>/../../javascript-sdk/src/capture.ts',
    '^@credflare/sdk-javascript$':
      '<rootDir>/../../javascript-sdk/src/index.ts',
  },
};
