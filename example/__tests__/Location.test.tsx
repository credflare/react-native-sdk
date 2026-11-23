import React from 'react';
import ReactTestRenderer from 'react-test-renderer';
import type { LocationFix } from '@credflare/sdk-react-native';
import { text } from '@credflare/sdk-javascript';
import { CredflareVerification } from '../../src/verification-flow';
import { positionToFix } from '../../src/location-step';
import { descriptor, fakeApi, fixture, helpers, replayProvider } from '../test-support/flow-harness';

test('asks for the location at the reference place, retries a weak fix, shows server rejections by code and ends with a receipt', async () => {
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
  await waitFor(() => texts().includes('Your location is not precise enough to check this place. Move near a window or outside, then try again.'), 'accuracy rejection');
  const verifier = fixture('capture-session').data.requester.name;
  expect(texts()).toEqual(expect.arrayContaining([
    text('rejection.location_accuracy.title'),
    text('rejection.requested_by', { verifier }),
    text('rejection.help', { verifier }),
  ]));
  expect(texts()).not.toContain('Send location');
  await press(text('rejection.action.retry'));
  await waitFor(() => texts().includes('Send location'), 'fix taken again');
  await press('Send location');
  await waitFor(() => texts().includes('You do not seem to be at Head office yet. Move closer, then try again.'), 'place rejection');
  expect(texts()).toContain(text('rejection.location_reference.title'));
  await press(text('rejection.action.retry'));
  await waitFor(() => texts().includes('Send location'), 'fix taken a third time');
  await press('Send location');
  await waitFor(() => texts().includes('Evidence received'), 'receipt');
  expect(texts()).toContain('Location received');
  const submits = api.calls.filter(call => call.url.endsWith('/submit')).map(call => ({ ...JSON.parse(String(call.body)), key: call.key }));
  expect(submits).toHaveLength(3);
  expect(new Set(submits.map(item => item.key)).size).toBe(3);
  expect(submits[2]).toMatchObject({ type: 'location_verification', latitude: 4.0511, longitude: 9.7679, metadata: { accuracy: 12, altitude: null, is_mock: false, provider: 'gps' } });
  await ReactTestRenderer.act(async () => renderer!.unmount());
}, 60000);

function fixedLocator(fix: Partial<LocationFix>) {
  return {
    requestPermission: jest.fn(async () => true),
    getFix: jest.fn(async (): Promise<LocationFix> => ({ latitude: 4.0511, longitude: 9.7679, accuracy: 12, altitude: null, fixTime: Date.now(), isMock: false, provider: 'gps', ...fix })),
  };
}

test('a mock location is refused on the device and never sent', async () => {
  const api = fakeApi();
  api.stage.facial = true;
  global.fetch = api.fetcher as unknown as typeof fetch;
  const locator = fixedLocator({ isMock: true, accuracy: 5 });
  let renderer: ReactTestRenderer.ReactTestRenderer;
  await ReactTestRenderer.act(async () => {
    renderer = ReactTestRenderer.create(
      <CredflareVerification autoStart onClose={() => {}} sessionProvider={descriptor} faceProvider={replayProvider(() => null)} locator={locator} />,
    );
  });
  const { texts, press, waitFor } = helpers(() => renderer!);
  await waitFor(() => texts().includes('Share location'), 'location consent');
  await press('Share location');
  await waitFor(() => texts().includes(text('location.mock_detected')), 'mock refusal');
  expect(locator.getFix).toHaveBeenCalledTimes(1);
  expect(texts()).not.toContain('Send location');
  expect(api.calls.filter(call => call.url.endsWith('/submit'))).toHaveLength(0);
  await ReactTestRenderer.act(async () => renderer!.unmount());
}, 60000);

test('a send that never reached the server is retried with the same request key and the same body', async () => {
  const api = fakeApi({ droppedSubmits: 1 });
  api.stage.facial = true;
  global.fetch = api.fetcher as unknown as typeof fetch;
  let renderer: ReactTestRenderer.ReactTestRenderer;
  await ReactTestRenderer.act(async () => {
    renderer = ReactTestRenderer.create(
      <CredflareVerification autoStart onClose={() => {}} sessionProvider={descriptor} faceProvider={replayProvider(() => null)} locator={fixedLocator({})} />,
    );
  });
  const { texts, press, waitFor } = helpers(() => renderer!);
  await waitFor(() => texts().includes('Share location'), 'location consent');
  await press('Share location');
  await waitFor(() => texts().includes('Send location'), 'fix found');
  await press('Send location');
  await waitFor(() => texts().includes(text('errors.send_location_failed')), 'network failure');
  const firstSentAt = Date.now();
  await waitFor(() => Date.now() > firstSentAt + 5, 'a later moment');
  await press('Send location');
  await waitFor(() => texts().includes('Evidence received'), 'receipt');
  const submits = api.calls.filter(call => call.url.endsWith('/submit'));
  const keys = submits.map(call => call.key);
  expect(keys).toHaveLength(2);
  expect(keys[0]).toMatch(/^[0-9a-f-]{36}$/);
  expect(keys[1]).toBe(keys[0]);
  expect(submits[1].body).toBe(submits[0].body);
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
