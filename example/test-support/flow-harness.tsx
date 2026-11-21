import { useEffect } from 'react';
import { Text } from 'react-native';
import ReactTestRenderer from 'react-test-renderer';
import { Response } from 'whatwg-fetch';
import type {
  FaceSample,
  LivenessCameraProps,
  NativeFaceProvider,
} from '@credflare/sdk-react-native';

const root = '../../../javascript-sdk/test/fixtures/';
export const fixture = (name: string) => require(`${root}${name}.json`);
export const trace = (name: string): { samples: FaceSample[] } =>
  require(`${root}liveness-traces/${name}.json`);

export function replayProvider(gestures: () => string[] | null): NativeFaceProvider & { recorded: string[] } {
  const recorded: string[] = [];
  function ReplayCamera({ handle, onSample, active }: LivenessCameraProps) {
    useEffect(() => {
      handle.current = {
        takePhoto: async name => {
          recorded.push(`photo:${name}`);
          return { uri: `file:///tmp/${name}.jpg`, name: `${name}.jpg`, type: 'image/jpeg' };
        },
        startRecording: async seconds => {
          recorded.push(`record:${seconds}`);
        },
        stopRecording: async () => {
          recorded.push('stop');
          return { uri: 'file:///tmp/liveness.mp4', name: 'liveness.mp4', type: 'video/mp4' };
        },
      };
    }, [handle]);
    useEffect(() => {
      if (!active) return;
      const names = gestures();
      const queue = names
        ? ['position_ok_pass', ...names.map(name => `${name}_pass`)].flatMap(name => trace(name).samples)
        : [];
      let index = 0;
      const timer = setInterval(() => {
        const next = queue.shift() ?? { t: 0, faces: 1, box: { x: 0.3, y: 0.22, w: 0.4, h: 0.5 }, eye_open: 0.85, smile: 0.05, yaw: 0, pitch: 0 };
        onSample({ ...next, t: index++ * 66 });
      }, 1);
      return () => clearInterval(timer);
    }, [active, onSample]);
    return null;
  }
  return { name: 'default', Camera: ReplayCamera, requestPermission: async () => true, recorded };
}

export interface Call {
  url: string;
  method: string;
  body: unknown;
  key?: string;
}

export function fakeApi(options: { locationRejections?: string[]; session?: string } = {}) {
  const capture = fixture(options.session ?? 'capture-session');
  const rejections = [...(options.locationRejections ?? [])];
  const stage = { facial: false, location: false, locationTries: 0 };
  const calls: Call[] = [];
  let gestures: string[] | null = null;
  const json = (status: number, value: unknown) => new Response(JSON.stringify(value), { status, headers: { 'Content-Type': 'application/json' } });
  const fetcher = jest.fn(async (url: string, init?: RequestInit) => {
    const method = init?.method ?? 'GET';
    const headers = (init?.headers ?? {}) as Record<string, string>;
    calls.push({ url, method, body: init?.body, key: headers['X-Idempotency-Key'] });
    if (method === 'GET') {
      const data = JSON.parse(JSON.stringify(capture.data));
      data.profile.verification_requirements = data.profile.verification_requirements.filter(
        (item: { verification_type: string }) =>
          !(stage.facial && item.verification_type === 'facial_verification') &&
          !(stage.location && item.verification_type === 'location_verification'),
      );
      return json(200, { ...capture, data });
    }
    if (url.endsWith('/liveness-challenges')) {
      const challenge = fixture('liveness-challenge');
      gestures = challenge.data.gestures;
      return json(201, { ...challenge, data: { ...challenge.data, expires_at: new Date(Date.now() + 120000).toISOString() } });
    }
    if (url.endsWith('/uploads/biometrics')) {
      const type = (init!.body as FormData).get('type');
      return json(201, fixture({ gesture: 'gesture-upload', liveness_video: 'video-upload', selfie: 'selfie-upload' }[String(type)]!));
    }
    if (url.endsWith('/submit')) {
      const payload = JSON.parse(String(init!.body));
      if (payload.type === 'facial_verification') {
        stage.facial = true;
        return json(201, fixture('facial-submission'));
      }
      stage.locationTries += 1;
      const rejection = rejections.shift();
      if (rejection) return json(422, fixture(rejection));
      stage.location = true;
      return json(201, fixture('location-submission'));
    }
    return json(404, { success: false, message: 'Not found' });
  });
  return { fetcher, calls, stage, gestures: () => gestures };
}

export const descriptor = async () => ({
  session_id: fixture('capture-session').data.session_id,
  api_base_url: 'https://api.example.test/api/v1',
  token: 'test-session-token',
  expires_at: '2030-01-01T00:00:00Z',
});

export function helpers(renderer: () => ReactTestRenderer.ReactTestRenderer) {
  const texts = () =>
    renderer()
      .root.findAllByType(Text)
      .map(node => (Array.isArray(node.props.children) ? node.props.children.join('') : node.props.children))
      .filter((value: unknown) => typeof value === 'string');
  const press = async (label: string) => {
    const text = renderer().root.findAllByType(Text).find(node => node.props.children === label);
    if (!text) throw new Error(`No ${label} in ${texts().join(' | ')}`);
    let node = text.parent!;
    while (!node.props.onPress) node = node.parent!;
    await ReactTestRenderer.act(async () => {
      await node.props.onPress();
    });
  };
  const waitFor = async (check: () => boolean, label: string, timeout = 10000) => {
    const end = Date.now() + timeout;
    while (Date.now() < end) {
      if (check()) return;
      await ReactTestRenderer.act(async () => {
        await new Promise(resolve => setTimeout(resolve, 20));
      });
    }
    throw new Error(`Timed out waiting for ${label}: ${texts().join(' | ')}`);
  };
  return { texts, press, waitFor };
}
