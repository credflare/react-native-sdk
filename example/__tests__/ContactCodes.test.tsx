import React from 'react';
import { readdirSync } from 'fs';
import { join } from 'path';
import { Linking } from 'react-native';
import ReactTestRenderer from 'react-test-renderer';
import { rejections, text } from '@credflare/sdk-javascript';
import type { CopyKey } from '@credflare/sdk-javascript';
import { CredflareVerification } from '@credflare/sdk-react-native';
import { contactApi, descriptor, fixture, helpers, inputs } from '../test-support/flow-harness';

const verifier = fixture('requirement-added-session').data.requester.name;
const sendCodes = ['not_configured', 'resend_too_soon', 'send_limit'];
const codes = readdirSync(join(__dirname, '../../../javascript-sdk/test/fixtures/rejections'))
  .map(name => name.replace(/\.json$/, ''))
  .filter(name => /^(email|phone)\./.test(name));

function session(channel: 'email' | 'phone') {
  const base = fixture('requirement-added-session');
  return { ...base, data: { ...base.data, profile: { ...base.data.profile, verification_requirements: [{ verification_type: `${channel}_verification`, settings: null }] } } };
}

test('every email and phone rejection in the spec has a fixture', () => {
  expect(codes.sort()).toEqual(Object.keys(rejections.codes).filter(code => /^(email|phone)\./.test(code)).sort());
  expect(codes).toHaveLength(14);
});

test.each(codes)('%s shows the shared copy and its action', async code => {
  const [channel, reason] = code.split('.') as ['email' | 'phone', string];
  const resendAt = fixture(`rejections/${code}`).resend_available_at;
  if (resendAt) {
    jest.useFakeTimers({
      now: Date.parse(resendAt) - 42000,
      doNotFake: ['setTimeout', 'clearTimeout', 'setInterval', 'clearInterval', 'setImmediate', 'clearImmediate', 'nextTick', 'queueMicrotask', 'requestAnimationFrame', 'cancelAnimationFrame', 'hrtime', 'performance'],
    });
  }
  const onSend = sendCodes.includes(reason);
  const api = contactApi({
    sessions: [session(channel)],
    codes: onSend ? [`rejections/${code}`] : [],
    confirms: onSend ? [] : [`rejections/${code}`],
  });
  global.fetch = api.fetcher as unknown as typeof fetch;
  const onClose = jest.fn();
  let renderer: ReactTestRenderer.ReactTestRenderer;
  await ReactTestRenderer.act(async () => {
    renderer = ReactTestRenderer.create(<CredflareVerification autoStart onClose={onClose} sessionProvider={descriptor} />);
  });
  const { texts, press, pressLast, waitFor } = helpers(() => renderer!);
  const { type, field } = inputs(() => renderer!);
  await waitFor(() => texts().includes(text(`${channel}.title` as CopyKey)), 'destination');
  await type(text(`${channel}.label` as CopyKey), channel === 'email' ? 'jane.doe@example.test' : '+237650000001');
  await press(text(`${channel}.send` as CopyKey));
  if (!onSend) {
    await waitFor(() => texts().includes(text('contact_code.title')), 'code entry');
    await type(text('contact_code.label'), '123456');
    await press(text('contact_code.confirm'));
  }
  const copy = (rejections.codes as Record<string, { title: CopyKey; message: CopyKey; action: keyof typeof rejections.actions }>)[code];
  await waitFor(() => texts().includes(text(copy.title, { verifier })), 'rejection title');
  expect(texts()).toEqual(expect.arrayContaining([
    text(copy.message, { verifier }),
    text('rejection.requested_by', { verifier }),
    text('rejection.help', { verifier }),
    text(rejections.actions[copy.action].label as CopyKey),
  ]));
  const server = fixture(`rejections/${code}`).message;
  if (server !== text(copy.message, { verifier })) expect(texts()).not.toContain(server);
  const requests = () => api.calls.filter(call => call.url.endsWith(`/${channel}-codes`)).length;
  const before = requests();
  switch (copy.action) {
    case 'leave':
      await pressLast(text('rejection.action.leave'));
      expect(onClose).toHaveBeenCalledTimes(1);
      break;
    case 'wait': {
      const button = renderer!.root.findAll(node => node.props.accessibilityRole === 'button' && node.props.accessibilityState?.disabled === true);
      expect(button.length).toBeGreaterThan(0);
      expect(texts()).toContain(text('contact_code.resend_in', { seconds: 42 }));
      expect(requests()).toBe(before);
      break;
    }
    case 'new_code':
      await press(text('rejection.action.new_code'));
      await waitFor(() => requests() === before + 1 && texts().includes(text('contact_code.title')), 'new code');
      expect(field(text('contact_code.label')).props.value).toBe('');
      break;
    case 'reenter_code':
      await press(text('rejection.action.reenter_code'));
      expect(field(text('contact_code.label')).props.value).toBe('');
      expect(requests()).toBe(before);
      break;
    default:
      throw new Error(`Unexpected action ${copy.action}`);
  }
  await ReactTestRenderer.act(async () => renderer!.unmount());
  jest.useRealTimers();
}, 30000);

test('the help line links to the help contact the requester set', async () => {
  const helpSession = fixture('help-contact-session');
  const base = session('email');
  const api = contactApi({ sessions: [{ ...base, data: { ...base.data, requester: helpSession.data.requester } }], codes: ['rejections/email.send_limit'] });
  global.fetch = api.fetcher as unknown as typeof fetch;
  const open = jest.spyOn(Linking, 'openURL').mockResolvedValue(true);
  let renderer: ReactTestRenderer.ReactTestRenderer;
  await ReactTestRenderer.act(async () => {
    renderer = ReactTestRenderer.create(<CredflareVerification autoStart onClose={() => {}} sessionProvider={descriptor} />);
  });
  const { texts, press, waitFor } = helpers(() => renderer!);
  const { type } = inputs(() => renderer!);
  await waitFor(() => texts().includes(text('email.title')), 'destination');
  await type(text('email.label'), 'jane.doe@example.test');
  await press(text('email.send'));
  await waitFor(() => texts().includes(text('rejection.code_send_limit.title')), 'rejection');
  const { requester } = helpSession.data;
  const link = renderer!.root.findAll(node => node.props.accessibilityRole === 'link' && typeof node.props.onPress === 'function')[0];
  expect(link.props.children).toBe(requester.help_email);
  const line = link.parent!.parent!.props.children as unknown[];
  expect(line.map(part => (typeof part === 'string' ? part : requester.help_email)).join('')).toBe(
    text('rejection.help_email', { verifier: requester.name, help_email: requester.help_email }),
  );
  await ReactTestRenderer.act(async () => link.props.onPress());
  expect(open).toHaveBeenCalledWith(`mailto:${requester.help_email}`);
  open.mockRestore();
  await ReactTestRenderer.act(async () => renderer!.unmount());
}, 30000);

test('the resend button counts down from the last code request and then sends a new code', async () => {
  jest.useFakeTimers({ doNotFake: ['nextTick', 'setImmediate'] });
  try {
    const api = contactApi({ sessions: [session('email')] });
    global.fetch = api.fetcher as unknown as typeof fetch;
    let renderer: ReactTestRenderer.ReactTestRenderer;
    await ReactTestRenderer.act(async () => {
      renderer = ReactTestRenderer.create(<CredflareVerification autoStart onClose={() => {}} sessionProvider={descriptor} />);
    });
    const { texts, press } = helpers(() => renderer!);
    const { type } = inputs(() => renderer!);
    const settle = async (ms = 0) => {
      await ReactTestRenderer.act(async () => {
        jest.advanceTimersByTime(ms);
        await Promise.resolve();
      });
    };
    for (let i = 0; i < 5 && !texts().includes(text('email.title')); i++) await settle(10);
    await type(text('email.label'), 'jane.doe@example.test');
    await press(text('email.send'));
    for (let i = 0; i < 5 && !texts().includes(text('contact_code.title')); i++) await settle(10);
    expect(texts()).toContain(text('contact_code.resend_in', { seconds: 60 }));
    expect(texts()).not.toContain(text('contact_code.resend'));
    await settle(30000);
    expect(texts()).toContain(text('contact_code.resend_in', { seconds: 30 }));
    await settle(31000);
    expect(texts()).toContain(text('contact_code.resend'));
    await press(text('contact_code.resend'));
    for (let i = 0; i < 5; i++) await settle(10);
    expect(api.calls.filter(call => call.url.endsWith('/email-codes')).map(call => call.body)).toEqual([
      { email: 'jane.doe@example.test' },
      { email: 'jane.doe@example.test' },
    ]);
    await ReactTestRenderer.act(async () => renderer!.unmount());
  } finally {
    jest.useRealTimers();
  }
}, 30000);
