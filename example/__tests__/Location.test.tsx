import React from 'react';
import ReactTestRenderer from 'react-test-renderer';
import type { LocationFix } from '@credflare/sdk-react-native';
import { CredflareVerification } from '../../src/verification-flow';
import { positionToFix } from '../../src/location-step';
import { descriptor, fakeApi, fixture, helpers, replayProvider } from '../test-support/flow-harness';

test('asks for the location at the reference place, retries a weak fix, shows a server rejection and ends with a receipt', async () => {
  const api = fakeApi({ locationRejections: ['location-rejection', 'reference-rejection'] });
  api.stage.facial = true;
  global.fetch = api.fetcher as unknown as typeof fetch;
  let accuracy = 400;
  const fixes: number[] = [];
  const locator = {
    requestPermission: jest.fn(async () => true),
    getFix: jest.fn(async (): Promise<LocationFix> => {
      fixes.push(accuracy);
      return { latitude: 4.0511, longitude: 9.7679, accuracy, altitude: null, fixTime: Date.now(), isMock: false, provider: 'gps' };
    }),
  };
  let renderer: ReactTestRenderer.ReactTestRenderer;
  await ReactTestRenderer.act(async () => {
    renderer = ReactTestRenderer.create(
      <CredflareVerification autoStart onClose={() => {}} sessionProvider={descriptor} faceProvider={replayProvider(() => null)} locator={locator} />,
    );
  });
  const { texts, press, waitFor } = helpers(() => renderer!);
  await waitFor(() => texts().includes('Share location'), 'location consent');
  expect(texts()).toContain('Share your location at Head office');
  expect(texts()).not.toContain('You need to be at Head office.');
  await press('Share location');
  await waitFor(() => texts().includes('Your location is not accurate enough yet. Move near a window or outside, then try again.'), 'low accuracy');
  expect(fixes).toEqual([400, 400, 400]);
  accuracy = 12;
  await press('Try again');
  await waitFor(() => texts().includes('Send location'), 'fix found');
  expect(texts()).toContain('Within 12 m');
  await press('Send location');
  await waitFor(() => texts().includes(fixture('location-rejection').message), 'server rejection');
  await press('Send location');
  await waitFor(() => texts().includes('You do not seem to be at Head office yet. Move closer, then try again.'), 'place rejection');
  await press('Send location');
  await waitFor(() => texts().includes('Evidence received'), 'receipt');
  expect(texts()).toContain('Location received');
  const submits = api.calls.filter(call => call.url.endsWith('/submit')).map(call => ({ ...JSON.parse(String(call.body)), key: call.key }));
  expect(submits).toHaveLength(3);
  expect(new Set(submits.map(item => item.key)).size).toBe(3);
  expect(submits[2]).toMatchObject({ type: 'location_verification', latitude: 4.0511, longitude: 9.7679, metadata: { accuracy: 12, altitude: null, is_mock: false, provider: 'gps' } });
  await ReactTestRenderer.act(async () => renderer!.unmount());
}, 60000);

test('maps native positions to the contract fields', () => {
  const position = { coords: { latitude: 1, longitude: 2, accuracy: 8, altitude: 30, heading: null, speed: null }, timestamp: 1700000000000, mocked: true, provider: 'gps' as const };
  expect(positionToFix(position, 'android')).toEqual({ latitude: 1, longitude: 2, accuracy: 8, altitude: 30, fixTime: 1700000000000, isMock: true, provider: 'gps' });
  expect(positionToFix({ ...position, mocked: undefined, provider: undefined }, 'ios')).toMatchObject({ isMock: null, provider: 'fused' });
});

test('the documents list names the selfie step that follows', async () => {
  const api = fakeApi({ session: 'combined-session' });
  global.fetch = api.fetcher as unknown as typeof fetch;
  let renderer: ReactTestRenderer.ReactTestRenderer;
  await ReactTestRenderer.act(async () => {
    renderer = ReactTestRenderer.create(
      <CredflareVerification autoStart onClose={() => {}} sessionProvider={descriptor} faceProvider={replayProvider(() => null)} />,
    );
  });
  const { texts, waitFor } = helpers(() => renderer!);
  await waitFor(() => texts().includes('After your documents, you will take a selfie.'), 'next step line');
  expect(texts()).not.toContain('After your documents, the app will guide you through the remaining steps.');
  await ReactTestRenderer.act(async () => renderer!.unmount());
});
