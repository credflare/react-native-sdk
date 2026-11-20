jest.mock('react-native-get-random-values', () => {
  global.crypto = require('node:crypto').webcrypto;
});
jest.mock('react-native-safe-area-context', () => require('react-native-safe-area-context/jest/mock').default);
