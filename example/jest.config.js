const fs = require('fs');
const path = require('path');
const sdkModules = fs
  .readdirSync(path.join(__dirname, '../../javascript-sdk/src'))
  .filter(name => name.endsWith('.ts') && !name.endsWith('.d.ts'))
  .map(name => name.slice(0, -3).replace(/\./g, '\\.'))
  .join('|');
module.exports = {
  modulePaths: ['<rootDir>/../node_modules'],
  preset: '@react-native/jest-preset',
  transformIgnorePatterns: [
    'node_modules/(?!((jest-)?react-native|@react-native(-community)?|@react-native-documents|react-native-image-picker|react-native-safe-area-context)/)',
  ],
  setupFilesAfterEnv: ['<rootDir>/jest.setup.js'],
  moduleNameMapper: {
    [`^\\./(${sdkModules})\\.js$`]:
      '<rootDir>/../../javascript-sdk/src/$1.ts',
    '^@credflare/sdk-javascript$':
      '<rootDir>/../../javascript-sdk/src/index.ts',
  },
};
