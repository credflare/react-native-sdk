import React from 'react';
import { readdirSync } from 'fs';
import { join } from 'path';
import { Linking } from 'react-native';
import ReactTestRenderer from 'react-test-renderer';
import { rejections, requirements, text } from '@credflare/sdk-javascript';
import type { CopyKey } from '@credflare/sdk-javascript';
import { CredflareVerification } from '@credflare/sdk-react-native';
import { contactApi, descriptor, fakeNow, fixture, helpers, inputs, issuedAt } from '../test-support/flow-harness';

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
  const onHostActionRequired = jest.fn();
  let renderer: ReactTestRenderer.ReactTestRenderer;
  await ReactTestRenderer.act(async () => {
    renderer = ReactTestRenderer.create(<CredflareVerification autoStart onClose={onClose} onHostActionRequired={onHostActionRequired} sessionProvider={descriptor} />);
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
  const requests = () => api.calls.filter(call => call.url.endsWith(`/${channel}-codes`)).length;
  if (copy.action === 'wait') {
    await waitFor(() => texts().includes(text('contact_code.title')), 'code entry');
    expect(texts()).toContain(text(copy.message, { verifier }));
    expect(texts()).toContain(text('contact_code.resend_in', { seconds: 42 }));
    expect(texts()).not.toContain(text('contact_code.resend'));
    expect(field(text('contact_code.label')).props.value).toBe('');
    expect(requests()).toBe(1);
    await ReactTestRenderer.act(async () => renderer!.unmount());
    jest.useRealTimers();
    return;
  }
  await waitFor(() => texts().includes(text(copy.title, { verifier })), 'rejection title');
  expect(texts()).toEqual(expect.arrayContaining([
    text(copy.message, { verifier }),
    text('rejection.requested_by', { verifier }),
    text('rejection.help', { verifier }),
    text(rejections.actions[copy.action].label as CopyKey),
  ]));
  const server = fixture(`rejections/${code}`).message;
  if (server !== text(copy.message, { verifier })) expect(texts()).not.toContain(server);
  const before = requests();
  switch (copy.action) {
    case 'leave':
      await pressLast(text('rejection.action.leave'));
      expect(onHostActionRequired).toHaveBeenCalledWith({ code });
      expect(onClose).toHaveBeenCalledTimes(1);
      break;
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
  jest.useFakeTimers({ now: issuedAt('email-code-request'), doNotFake: ['nextTick', 'setImmediate'] });
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

async function openFlow(api: ReturnType<typeof contactApi>, props: Partial<React.ComponentProps<typeof CredflareVerification>> = {}) {
  global.fetch = api.fetcher as unknown as typeof fetch;
  let renderer: ReactTestRenderer.ReactTestRenderer;
  await ReactTestRenderer.act(async () => {
    renderer = ReactTestRenderer.create(<CredflareVerification autoStart onClose={() => {}} sessionProvider={descriptor} {...props} />);
  });
  return { ...helpers(() => renderer!), ...inputs(() => renderer!), renderer: () => renderer!, unmount: () => ReactTestRenderer.act(async () => renderer!.unmount()) };
}

test('leaving a leave rejection by the header close reports the rejection code, never a cancellation', async () => {
  const onHostActionRequired = jest.fn();
  const onCancelled = jest.fn();
  const onClose = jest.fn();
  const view = await openFlow(contactApi({ sessions: [session('phone')], codes: ['rejections/phone.not_configured'] }), { onHostActionRequired, onCancelled, onClose });
  await view.waitFor(() => view.texts().includes(text('phone.title')), 'destination');
  await view.type(text('phone.label'), '+237650000001');
  await view.press(text('phone.send'));
  await view.waitFor(() => view.texts().includes(text('rejection.phone_not_configured.title', { verifier })), 'rejection');
  await view.press(text('common.close'));
  await view.press(text('exit.leave'));
  expect(onHostActionRequired).toHaveBeenCalledWith({ code: 'phone.not_configured' });
  expect(onCancelled).not.toHaveBeenCalled();
  expect(onClose).toHaveBeenCalledTimes(1);
  await view.unmount();
}, 30000);

test('a resend refusal after the earlier send was lost shows the code entry for the destination the server names', async () => {
  const rejection = fixture('rejections/phone.resend_too_soon');
  fakeNow(Date.parse(rejection.resend_available_at) - 30000);
  try {
    const api = contactApi({ sessions: [session('phone'), { ...session('phone'), data: { ...session('phone').data, profile: { ...session('phone').data.profile, verification_requirements: [] } } }], codes: ['rejections/phone.resend_too_soon'] });
    const view = await openFlow(api);
    await view.waitFor(() => view.texts().includes(text('phone.title')), 'destination');
    await view.type(text('phone.label'), '+237 650 000 009');
    await view.press(text('phone.send'));
    await view.waitFor(() => view.texts().includes(text('contact_code.title')), 'code entry');
    const minutes = Math.ceil((Date.parse(rejection.expires_at) - Date.now()) / 60000);
    expect(view.texts()).toContain(text('rejection.code_resend_too_soon.message', { verifier }));
    expect(view.texts()).toContain(text('contact_code.body', { destination: rejection.destination, minutes }));
    expect(view.texts()).toContain(text('contact_code.resend_in', { seconds: 30 }));
    expect(view.texts()).toContain(text('contact_code.sends_remaining', { count: rejection.sends_remaining }));
    expect(view.texts()).toContain(text('phone.change_after'));
    expect(view.texts().join(' ')).not.toContain('650 000 009');
    await view.type(text('contact_code.label'), '123456');
    await view.press(text('contact_code.confirm'));
    await view.waitFor(() => view.texts().includes(text('receipt.title')), 'receipt');
    expect(api.calls.find(call => call.url.endsWith('/phone-codes/confirm'))!.body).toEqual({ code: '123456' });
    await view.unmount();
  } finally {
    jest.useRealTimers();
  }
}, 30000);

test('a resend refusal names the destination the server reports, not the one this screen sent last', async () => {
  const rejection = fixture('rejections/email.resend_too_soon');
  fakeNow(Date.parse(rejection.resend_available_at) - 20000);
  try {
    const api = contactApi({ sessions: [session('email')], codes: ['email-code-request', 'rejections/email.resend_too_soon'] });
    const view = await openFlow(api);
    await view.waitFor(() => view.texts().includes(text('email.title')), 'destination');
    await view.type(text('email.label'), 'jane.doe@example.test');
    await view.press(text('email.send'));
    await view.waitFor(() => view.texts().includes(text('contact_code.title')), 'code entry');
    await view.press(text('email.change'));
    await view.type(text('email.label'), 'other@example.test');
    await view.press(text('email.send'));
    await view.waitFor(() => view.texts().includes(text('email.change_after')), 'note');
    const sent = fixture('email-code-request').data;
    expect(sent.destination).not.toBe(rejection.destination);
    expect(view.texts()).toContain(text('contact_code.body', { destination: rejection.destination, minutes: Math.ceil((Date.parse(rejection.expires_at) - Date.now()) / 60000) }));
    expect(view.texts().join(' ')).not.toContain(sent.destination);
    expect(view.texts().join(' ')).not.toContain('other@example.test');
    await view.unmount();
  } finally {
    jest.useRealTimers();
  }
}, 30000);

test('a failed request for a new code replaces the expired code rejection with the error', async () => {
  const api = contactApi({ sessions: [session('phone')], codes: ['phone-code-request', 'unauthorized'], confirms: ['rejections/phone.code_expired'], statuses: { unauthorized: 401 } });
  const view = await openFlow(api);
  await view.waitFor(() => view.texts().includes(text('phone.title')), 'destination');
  await view.type(text('phone.label'), '+237650000001');
  await view.press(text('phone.send'));
  await view.waitFor(() => view.texts().includes(text('contact_code.title')), 'code entry');
  await view.type(text('contact_code.label'), '123456');
  await view.press(text('contact_code.confirm'));
  await view.waitFor(() => view.texts().includes(text('rejection.code_expired.title', { verifier })), 'expired');
  await view.press(text('rejection.action.new_code'));
  await view.waitFor(() => view.texts().includes(text('errors.session_expired')), 'session expired');
  expect(view.texts()).not.toContain(text('rejection.code_expired.title', { verifier }));
  await view.unmount();
}, 30000);

test('the resend countdown runs to the deadline the server set, even when the response was slow', async () => {
  fakeNow(issuedAt('phone-code-request') + 20000);
  try {
    const view = await openFlow(contactApi({ sessions: [session('phone')] }));
    await view.waitFor(() => view.texts().includes(text('phone.title')), 'destination');
    await view.type(text('phone.label'), '+237650000001');
    await view.press(text('phone.send'));
    await view.waitFor(() => view.texts().includes(text('contact_code.title')), 'code entry');
    expect(view.texts()).toContain(text('contact_code.resend_in', { seconds: 40 }));
    await view.unmount();
  } finally {
    jest.useRealTimers();
  }
}, 30000);

test('a refused new number during the cooldown keeps the code entry for the number that has a code', async () => {
  const rejection = fixture('rejections/phone.resend_too_soon');
  fakeNow(Date.parse(rejection.resend_available_at) - 30000);
  try {
    const api = contactApi({ sessions: [session('phone')], codes: ['phone-code-request', 'rejections/phone.resend_too_soon'] });
    const view = await openFlow(api);
    await view.waitFor(() => view.texts().includes(text('phone.title')), 'destination');
    await view.type(text('phone.label'), '+237650000001');
    await view.press(text('phone.send'));
    await view.waitFor(() => view.texts().includes(text('contact_code.title')), 'code entry');
    await view.press(text('phone.change'));
    await view.type(text('phone.label'), '+237650000002');
    await view.press(text('phone.send'));
    await view.waitFor(() => view.texts().includes(text('phone.change_after')), 'note');
    const sent = fixture('phone-code-request').data;
    expect(view.texts()).toContain(text('contact_code.body', { destination: sent.destination, minutes: requirements.contact_codes.ttl_minutes }));
    expect(view.texts()).toContain(text('contact_code.resend_in', { seconds: 30 }));
    expect(view.texts().join(' ')).not.toContain('+237650000002');
    await view.unmount();
  } finally {
    jest.useRealTimers();
  }
}, 30000);

test('a confirmation refused because the case closed ends on the receipt', async () => {
  const onClosed = jest.fn();
  const onSubmitted = jest.fn();
  const api = contactApi({ sessions: [session('phone')], confirms: ['session-closed'], statuses: { 'session-closed': 409 } });
  const view = await openFlow(api, { onClosed, onSubmitted });
  await view.waitFor(() => view.texts().includes(text('phone.title')), 'destination');
  await view.type(text('phone.label'), '+237650000001');
  await view.press(text('phone.send'));
  await view.waitFor(() => view.texts().includes(text('contact_code.title')), 'code entry');
  await view.type(text('contact_code.label'), '123456');
  await view.press(text('contact_code.confirm'));
  await view.waitFor(() => view.texts().includes(text('receipt.title')), 'receipt');
  expect(onClosed).toHaveBeenCalledTimes(1);
  expect(onSubmitted).not.toHaveBeenCalled();
  await view.unmount();
}, 30000);
