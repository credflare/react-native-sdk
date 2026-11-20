jest.mock('react-native-get-random-values', () => {
  global.crypto = require('node:crypto').webcrypto;
});
jest.mock(
  'react-native-safe-area-context',
  () => require('react-native-safe-area-context/jest/mock').default,
);

jest.mock('@react-native-documents/picker', () => ({
  ...jest.requireActual(
    '../node_modules/@react-native-documents/picker/src/errors.ts',
  ),
  ...jest.requireActual(
    '../node_modules/@react-native-documents/picker/src/fileTypes.ts',
  ),
  pick: jest.fn(() =>
    Promise.reject(new Error('Native selection requires a device test')),
  ),
}));
