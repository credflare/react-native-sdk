import React from 'react';
import ReactTestRenderer from 'react-test-renderer';
import { NitroModules } from 'react-native-nitro-modules';
import { liveness } from '@credflare/sdk-javascript';
import type { FaceSample } from '@credflare/sdk-javascript';
import { VisionSignalNormalizer, mlKitFaceProvider, nativeFaceProvider, visionFaceProvider } from '@credflare/sdk-react-native';

const thresholds = liveness.thresholds.default;

test('Vision values are converted to the contract conventions', () => {
  expect(VisionSignalNormalizer.contractYaw(-0.5)).toBeCloseTo((-0.5 * 180) / Math.PI, 9);
  expect(VisionSignalNormalizer.contractPitch(0.3)).toBeCloseTo((-0.3 * 180) / Math.PI, 9);
  const box = VisionSignalNormalizer.contractBox(0.2, 0.1, 0.4, 0.5);
  expect(box.x).toBeCloseTo(0.2, 9);
  expect(box.y).toBeCloseTo(0.4, 9);
  const normalizer = new VisionSignalNormalizer();
  for (let i = 0; i < VisionSignalNormalizer.baselineFrames; i++) expect(Math.abs(normalizer.eyeOpen(0.3) - 1)).toBeLessThanOrEqual(0.2);
  expect(normalizer.eyeBaseline).toBeCloseTo(0.3, 9);
  expect(normalizer.eyeOpen(0.12)).toBeLessThan(thresholds.eye_closed);
  expect(normalizer.eyeOpen(0.27)).toBeGreaterThan(thresholds.eye_open_baseline);
  for (let i = 0; i < VisionSignalNormalizer.baselineFrames; i++) normalizer.smile(0.9);
  expect(normalizer.smile(0.9)).toBeCloseTo(0, 9);
  expect(normalizer.smile(1.05)).toBeGreaterThan(thresholds.smile);
});

test('on iOS the default provider is Apple Vision and the camera turns Vision readings into contract samples', async () => {
  expect(nativeFaceProvider).toBe(visionFaceProvider);
  expect(mlKitFaceProvider).toBe(visionFaceProvider);
  expect(visionFaceProvider.name).toBe('vision');
  const samples: FaceSample[] = [];
  const Camera = visionFaceProvider.Camera;
  let renderer: ReactTestRenderer.ReactTestRenderer;
  await ReactTestRenderer.act(async () => {
    renderer = ReactTestRenderer.create(
      <Camera active recordVideo={false} handle={{ current: null }} onSample={sample => samples.push(sample)} onError={() => {}} />,
    );
  });
  const factory = (NitroModules.createHybridObject as jest.Mock).mock.results.at(-1)!.value;
  expect((NitroModules.createHybridObject as jest.Mock).mock.calls.at(-1)).toEqual(['VisionFaceDetectorFactory']);
  const { onReading } = factory.createOutput.mock.calls.at(-1)[0];
  onReading({ faces: 1, x: 0.3, y: 0.28, width: 0.4, height: 0.5, yaw: 0.2, pitch: -0.1, eyeRatio: 0.3, mouthRatio: 0.95 });
  onReading({ faces: 2, x: 0, y: 0, width: 0, height: 0 });
  expect(samples[0]).toMatchObject({ faces: 1, yaw: (0.2 * 180) / Math.PI, pitch: (0.1 * 180) / Math.PI });
  expect(samples[0].box!.y).toBeCloseTo(0.22, 9);
  expect(samples[1]).toMatchObject({ faces: 2, box: null, eye_open: null, smile: null, yaw: null, pitch: null });
  await ReactTestRenderer.act(async () => renderer!.unmount());
});
