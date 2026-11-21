import React from 'react';
import ReactTestRenderer from 'react-test-renderer';
import type { LivenessCameraProps } from '@credflare/sdk-react-native';
import { CredflareVerification } from '../../src/verification-flow';
import { descriptor, fakeApi, fixture, helpers, replayProvider } from '../test-support/flow-harness';

test('runs the server challenge from replayed face samples, uploads the evidence and submits it', async () => {
  const api = fakeApi();
  global.fetch = api.fetcher as unknown as typeof fetch;
  const provider = replayProvider(api.gestures);
  let renderer: ReactTestRenderer.ReactTestRenderer;
  await ReactTestRenderer.act(async () => {
    renderer = ReactTestRenderer.create(
      <CredflareVerification autoStart onClose={() => {}} sessionProvider={descriptor} faceProvider={provider} />,
    );
  });
  const { texts, press, waitFor } = helpers(() => renderer!);
  await waitFor(() => texts().includes('Follow the prompts'), 'liveness intro');
  const verifier = fixture('capture-session').data.requester.name;
  expect(texts()).toContain(`This step records a short video of your face. It is sent to ${verifier} for review.`);
  expect(texts()).toContain(`Your selfie will be sent to ${verifier} for review.`);
  await press('Start');
  await waitFor(() => texts().includes('Take selfie'), 'selfie step', 20000);
  const challenge = fixture('liveness-challenge').data;
  expect(provider.recorded).toEqual([
    `record:${challenge.max_video_seconds}`,
    ...challenge.gestures.map((gesture: string) => `photo:${gesture}`),
    'stop',
  ]);
  await press('Take selfie');
  await waitFor(() => texts().includes('Send selfie'), 'selfie review');
  await press('Send selfie');
  await waitFor(() => texts().includes('Share location'), 'location step');
  const uploads = api.calls.filter(call => call.url.endsWith('/uploads/biometrics'));
  expect(uploads.map(call => (call.body as FormData).get('type'))).toEqual(['gesture', 'gesture', 'gesture', 'liveness_video', 'selfie']);
  expect(uploads.slice(0, 3).map(call => (call.body as FormData).get('gesture'))).toEqual(challenge.gestures);
  for (const call of uploads) {
    expect((call.body as FormData).get('challenge_id')).toBe(challenge.challenge_id);
    expect((call.body as FormData).get('capture_source')).toBe('camera');
    expect(call.key).toMatch(/^[0-9a-f-]{36}$/);
  }
  const submitted = JSON.parse(String(api.calls.find(call => call.url.endsWith('/submit'))!.body));
  expect(submitted).toMatchObject({ type: 'facial_verification', challenge_id: challenge.challenge_id, image_file_id: 4, gesture_file_ids: [3, 3, 3], video_file_id: 5 });
  expect(submitted.metadata.provider).toBe('default');
  expect(submitted.metadata.liveness_results.map((item: { challenge: string }) => item.challenge)).toEqual(challenge.gestures);
  await ReactTestRenderer.act(async () => renderer!.unmount());
}, 60000);

test('a gesture timeout offers a retry that asks for a new challenge', async () => {
  const api = fakeApi();
  global.fetch = api.fetcher as unknown as typeof fetch;
  const replay = replayProvider(() => null);
  const noFace = { ...replay, Camera: (props: LivenessCameraProps) => <replay.Camera {...props} onSample={sample => props.onSample({ ...sample, faces: 0, box: null })} /> };
  let renderer: ReactTestRenderer.ReactTestRenderer;
  await ReactTestRenderer.act(async () => {
    renderer = ReactTestRenderer.create(
      <CredflareVerification autoStart onClose={() => {}} sessionProvider={descriptor} faceProvider={noFace} />,
    );
  });
  const { texts, press, waitFor } = helpers(() => renderer!);
  await waitFor(() => texts().includes('Start'), 'intro');
  await press('Start');
  await waitFor(() => texts().includes('Time ran out for this movement.'), 'timeout', 30000);
  expect(texts()).toContain('Try again');
  await press('Try again');
  await waitFor(() => api.calls.filter(call => call.url.endsWith('/liveness-challenges')).length === 2, 'second challenge');
  await ReactTestRenderer.act(async () => renderer!.unmount());
}, 60000);
