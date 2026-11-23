import React from 'react';
import ReactTestRenderer from 'react-test-renderer';
import type { LivenessCameraProps } from '@credflare/sdk-react-native';
import { text } from '@credflare/sdk-javascript';
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
  const submitCall = api.calls.find(call => call.url.endsWith('/submit'))!;
  expect(submitCall.key).toMatch(/^[0-9a-f-]{36}$/);
  const submitted = JSON.parse(String(submitCall.body));
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

test('a used challenge rejected by code restarts with a new challenge', async () => {
  const api = fakeApi({ facialRejections: ['rejections/liveness.challenge_used'] });
  global.fetch = api.fetcher as unknown as typeof fetch;
  const provider = replayProvider(api.gestures);
  let renderer: ReactTestRenderer.ReactTestRenderer;
  await ReactTestRenderer.act(async () => {
    renderer = ReactTestRenderer.create(
      <CredflareVerification autoStart onClose={() => {}} sessionProvider={descriptor} faceProvider={provider} />,
    );
  });
  const { texts, press, waitFor } = helpers(() => renderer!);
  await waitFor(() => texts().includes('Start'), 'intro');
  await press('Start');
  await waitFor(() => texts().includes('Take selfie'), 'selfie step', 20000);
  await press('Take selfie');
  await waitFor(() => texts().includes('Send selfie'), 'review');
  await press('Send selfie');
  await waitFor(() => texts().includes(text('rejection.liveness_restart.message')), 'restart prompt');
  expect(texts()).toContain(text('rejection.liveness_restart.title'));
  expect(texts()).toContain(text('rejection.requested_by', { verifier: fixture('capture-session').data.requester.name }));
  expect(texts()).not.toContain(fixture('rejections/liveness.challenge_used').message);
  await press(text('rejection.action.restart'));
  await waitFor(() => api.calls.filter(call => call.url.endsWith('/liveness-challenges')).length === 2, 'new challenge');
  await ReactTestRenderer.act(async () => renderer!.unmount());
}, 60000);

async function reachReview(api: ReturnType<typeof fakeApi>) {
  global.fetch = api.fetcher as unknown as typeof fetch;
  const provider = replayProvider(api.gestures);
  let renderer: ReactTestRenderer.ReactTestRenderer;
  await ReactTestRenderer.act(async () => {
    renderer = ReactTestRenderer.create(
      <CredflareVerification autoStart onClose={() => {}} sessionProvider={descriptor} faceProvider={provider} />,
    );
  });
  const view = helpers(() => renderer!);
  await view.waitFor(() => view.texts().includes('Start'), 'intro');
  await view.press('Start');
  await view.waitFor(() => view.texts().includes('Take selfie'), 'selfie step', 20000);
  await view.press('Take selfie');
  await view.waitFor(() => view.texts().includes('Send selfie'), 'review');
  return { ...view, unmount: () => ReactTestRenderer.act(async () => renderer!.unmount()) };
}

test('a send that never reached the server keeps the uploads and retries the submission with the same request key', async () => {
  const api = fakeApi({ droppedSubmits: 1 });
  const { texts, press, waitFor, unmount } = await reachReview(api);
  await press('Send selfie');
  await waitFor(() => texts().includes(text('errors.network')), 'network failure');
  expect(texts()).toContain('Send selfie');
  await press('Send selfie');
  await waitFor(() => texts().includes('Share location'), 'location step');
  const uploads = api.calls.filter(call => call.url.endsWith('/uploads/biometrics'));
  expect(uploads).toHaveLength(5);
  const keys = api.calls.filter(call => call.url.endsWith('/submit')).map(call => call.key);
  expect(keys).toHaveLength(2);
  expect(keys[1]).toBe(keys[0]);
  expect(api.calls.filter(call => call.url.endsWith('/liveness-challenges'))).toHaveLength(1);
  await unmount();
}, 60000);

test('a gesture mismatch shows the shared rejection copy and starts again with a new challenge', async () => {
  const api = fakeApi({ facialRejections: ['rejections/liveness.gesture_mismatch'] });
  const { texts, press, waitFor, unmount } = await reachReview(api);
  await press('Send selfie');
  await waitFor(() => texts().includes(text('rejection.gesture_mismatch.message')), 'rejection copy');
  expect(texts()).toContain(text('rejection.gesture_mismatch.title'));
  expect(texts()).not.toContain(fixture('rejections/liveness.gesture_mismatch').message);
  expect(api.calls.filter(call => call.url.endsWith('/liveness-challenges'))).toHaveLength(1);
  await press(text('rejection.action.restart'));
  await waitFor(() => api.calls.filter(call => call.url.endsWith('/liveness-challenges')).length === 2, 'new challenge');
  await unmount();
}, 60000);

test('a device without a usable front camera gets the camera message instead of a challenge', async () => {
  const api = fakeApi();
  global.fetch = api.fetcher as unknown as typeof fetch;
  const replay = replayProvider(api.gestures);
  const noCamera = { ...replay, isAvailable: async () => false };
  let renderer: ReactTestRenderer.ReactTestRenderer;
  await ReactTestRenderer.act(async () => {
    renderer = ReactTestRenderer.create(
      <CredflareVerification autoStart onClose={() => {}} sessionProvider={descriptor} faceProvider={noCamera} />,
    );
  });
  const { texts, press, waitFor } = helpers(() => renderer!);
  await waitFor(() => texts().includes('Start'), 'intro');
  await press('Start');
  await waitFor(() => texts().includes(text('errors.camera_unavailable')), 'camera message');
  expect(api.calls.filter(call => call.url.endsWith('/liveness-challenges'))).toHaveLength(0);
  expect(texts()).toContain('Try again');
  await ReactTestRenderer.act(async () => renderer!.unmount());
}, 60000);

test('a camera that fails while starting shows the camera message and keeps the step usable', async () => {
  const api = fakeApi();
  global.fetch = api.fetcher as unknown as typeof fetch;
  const replay = replayProvider(api.gestures);
  function BrokenCamera(): React.ReactElement {
    throw new Error('Cannot listen to device orientation changes');
  }
  const broken = { ...replay, Camera: BrokenCamera };
  const quiet = jest.spyOn(console, 'error').mockImplementation(() => {});
  let renderer: ReactTestRenderer.ReactTestRenderer;
  await ReactTestRenderer.act(async () => {
    renderer = ReactTestRenderer.create(
      <CredflareVerification autoStart onClose={() => {}} sessionProvider={descriptor} faceProvider={broken} />,
    );
  });
  const { texts, press, waitFor } = helpers(() => renderer!);
  await waitFor(() => texts().includes('Start'), 'intro');
  await press('Start');
  await waitFor(() => texts().includes(text('errors.camera_unavailable')), 'camera message');
  expect(texts()).toContain('Follow the prompts');
  await press('Try again');
  await waitFor(() => api.calls.filter(call => call.url.endsWith('/liveness-challenges')).length === 2, 'second attempt');
  await waitFor(() => texts().includes(text('errors.camera_unavailable')), 'camera message again');
  quiet.mockRestore();
  await ReactTestRenderer.act(async () => renderer!.unmount());
}, 60000);

test('a photo that never arrives from the camera ends in the selfie message', async () => {
  const api = fakeApi();
  global.fetch = api.fetcher as unknown as typeof fetch;
  const provider = replayProvider(api.gestures);
  function StuckCamera(props: LivenessCameraProps) {
    const handle = React.useRef<LivenessCameraProps['handle']['current']>(null);
    React.useEffect(() => {
      const real = handle.current!;
      props.handle.current = { ...real, takePhoto: name => (name === 'selfie' ? new Promise(() => {}) : real.takePhoto(name)) };
    });
    return <provider.Camera {...props} handle={handle} />;
  }
  let renderer: ReactTestRenderer.ReactTestRenderer;
  await ReactTestRenderer.act(async () => {
    renderer = ReactTestRenderer.create(
      <CredflareVerification autoStart onClose={() => {}} sessionProvider={descriptor} faceProvider={{ ...provider, Camera: StuckCamera }} />,
    );
  });
  const { texts, press, waitFor } = helpers(() => renderer!);
  await waitFor(() => texts().includes('Start'), 'intro');
  await press('Start');
  await waitFor(() => texts().includes('Take selfie'), 'selfie step', 20000);
  await press('Take selfie');
  await waitFor(() => texts().includes(text('errors.selfie_failed')), 'selfie message', 20000);
  expect(texts()).toContain('Take selfie');
  await ReactTestRenderer.act(async () => renderer!.unmount());
}, 60000);
