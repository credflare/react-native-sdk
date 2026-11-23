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

jest.mock('react-native-svg', () => {
  const React = require('react');
  const {View} = require('react-native');
  const Svg = props => React.createElement(View, {testID: 'svg', accessible: props.accessible}, props.children);
  const Path = props => React.createElement(View, {testID: 'svg-path', d: props.d});
  return {__esModule: true, default: Svg, Svg, Path};
});

jest.mock('react-native-vision-camera', () => {
  const React = require('react');
  const {View} = require('react-native');
  return {
    Camera: props => React.createElement(View, {testID: 'vision-camera', isActive: props.isActive}),
    CommonResolutions: {VGA_4_3: {width: 480, height: 640}, HD_4_3: {width: 768, height: 1024}},
    VisionCamera: {cameraPermissionStatus: 'authorized', requestCameraPermission: jest.fn(async () => true)},
    usePhotoOutput: () => ({capturePhotoToFile: jest.fn()}),
    useVideoOutput: () => ({createRecorder: jest.fn()}),
  };
});

jest.mock('react-native-vision-camera-face-detector', () => ({
  createFaceDetectorOutput: jest.fn(() => ({})),
}));

jest.mock('react-native-geolocation-service', () => ({
  __esModule: true,
  default: {
    getCurrentPosition: jest.fn((_success, error) => error({code: 2, message: 'Native location requires a device test'})),
    requestAuthorization: jest.fn(async () => 'granted'),
  },
}));

jest.mock('react-native-nitro-modules', () => ({
  NitroModules: {
    createHybridObject: jest.fn(() => ({createOutput: jest.fn(() => ({}))})),
  },
}));
