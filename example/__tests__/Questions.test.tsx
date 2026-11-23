import React from 'react';
import ReactTestRenderer from 'react-test-renderer';
import { text } from '@credflare/sdk-javascript';
import type { Question, SessionInfo } from '@credflare/sdk-javascript';
import { CredflareVerification } from '@credflare/sdk-react-native';
import { completed, contactApi, descriptor, fakeNow, fixture, helpers, inputs, issuedAt } from '../test-support/flow-harness';

const verifier = fixture('questionnaire-session').data.requester.name;

async function open(api: ReturnType<typeof contactApi>, onClose = jest.fn()) {
  global.fetch = api.fetcher as unknown as typeof fetch;
  let renderer: ReactTestRenderer.ReactTestRenderer;
  await ReactTestRenderer.act(async () => {
    renderer = ReactTestRenderer.create(<CredflareVerification autoStart onClose={onClose} sessionProvider={descriptor} />);
  });
  return { ...helpers(() => renderer!), ...inputs(() => renderer!), onClose, unmount: () => ReactTestRenderer.act(async () => renderer!.unmount()) };
}

test('answers the questionnaire, then confirms a phone number the workflow added, then shows the receipt', async () => {
  fakeNow(issuedAt('phone-code-request'));
  const api = contactApi({
    sessions: [fixture('questionnaire-session'), fixture('requirement-added-session'), completed('requirement-added-session')],
    confirms: ['rejections/phone.code_invalid'],
  });
  const view = await open(api);
  const { texts, press, waitFor, type, field } = view;
  await waitFor(() => texts().includes(text('questions.title')), 'questionnaire');
  expect(texts()).toContain(text('questions.body', { verifier }));
  expect(texts()).not.toContain('Employer name');
  expect(texts()).not.toContain('Other source of funds (Optional)');

  await press(text('questions.send'));
  expect(texts()).toContain(text('questions.required'));
  expect(texts()).toContain(text('questions.consent_required'));
  expect(api.calls.filter(call => call.url.endsWith('/submit'))).toHaveLength(0);

  await press('Employed');
  expect(texts()).toContain('Employer name');
  expect(texts()).toContain('Yearly income (Optional)');
  await type('Employer name', 'Acme');
  await type('Yearly income', '-5');
  await press(text('questions.send'));
  expect(texts()).toContain(text('questions.number_min', { min: 0 }));
  await press('Student');
  expect(texts()).not.toContain('Employer name');
  expect(texts()).not.toContain('Yearly income (Optional)');

  await press('Other');
  expect(texts()).toContain('Other source of funds');
  await press('Other');
  expect(texts()).not.toContain('Other source of funds');

  await press(text('questions.choose_country'));
  await type('Country of residence', 'germ');
  await press('Germany');
  expect(texts()).toContain('Germany');
  await type('Date of birth', '19900231');
  expect(field('Date of birth').props.value).toBe('1990-02-31');
  await type('Email address', 'not an address');
  await press(text('questions.send'));
  expect(texts()).toContain(text('questions.invalid_date'));
  expect(texts()).toContain(text('questions.invalid_email'));
  await type('Date of birth', '19900131');
  await type('Email address', '');
  await press(fixture('questionnaire-session').data.profile.form_schema.find((q: { key: string }) => q.key === 'terms').label);
  await press(text('questions.send'));

  await waitFor(() => texts().includes(text('phone.title')), 'phone step added by the workflow');
  expect(texts()).not.toContain(text('receipt.title'));
  const submits = api.calls.filter(call => call.url.endsWith('/submit'));
  expect(submits).toHaveLength(1);
  expect(submits[0].body).toEqual({ type: 'form_submission', fields: { country: 'DE', employment: 'Student', birth_date: '1990-01-31', terms: true } });
  expect(submits[0].key).toMatch(/^[0-9a-f-]{36}$/);

  await type(text('phone.label'), '650 000');
  await press(text('phone.send'));
  expect(texts()).toContain(text('phone.invalid'));
  expect(api.calls.filter(call => call.url.endsWith('/phone-codes'))).toHaveLength(0);
  await type(text('phone.label'), '+237 (650) 00-00.01');
  await press(text('phone.send'));
  await waitFor(() => texts().includes(text('contact_code.title')), 'code entry');
  expect(api.calls.find(call => call.url.endsWith('/phone-codes'))!.body).toEqual({ phone: '+237650000001' });
  const sent = fixture('phone-code-request').data;
  expect(texts()).toContain(text('contact_code.body', { destination: sent.destination, minutes: 10 }));
  expect(texts()).toContain(text('contact_code.resend_in', { seconds: 60 }));
  expect(texts()).toContain(text('contact_code.sends_remaining', { count: sent.sends_remaining }));

  await type(text('contact_code.label'), '12a3456');
  expect(field(text('contact_code.label')).props.value).toBe('123456');
  await press(text('contact_code.confirm'));
  await waitFor(() => texts().includes(text('rejection.code_invalid.title')), 'wrong code');
  expect(texts()).toEqual(expect.arrayContaining([
    text('rejection.code_invalid.message'),
    text('rejection.requested_by', { verifier }),
    text('rejection.help', { verifier }),
  ]));
  await press(text('rejection.action.reenter_code'));
  expect(field(text('contact_code.label')).props.value).toBe('');
  await type(text('contact_code.label'), '654321');
  await press(text('contact_code.confirm'));
  await waitFor(() => texts().includes(text('receipt.title')), 'receipt');
  expect(texts()).toEqual(expect.arrayContaining([text('receipt.answers'), text('receipt.phone')]));
  const confirms = api.calls.filter(call => call.url.endsWith('/phone-codes/confirm')).map(call => call.body);
  expect(confirms).toEqual([{ code: '123456' }, { code: '654321' }]);
  await view.unmount();
  jest.useRealTimers();
}, 60000);

test('a failed check after a submit asks to try again and never shows the receipt', async () => {
  const api = contactApi({
    sessions: [fixture('requirement-added-session'), completed('requirement-added-session')],
    failedGets: [2],
  });
  const view = await open(api);
  const { texts, press, waitFor, type } = view;
  await waitFor(() => texts().includes(text('phone.title')), 'phone step');
  await type(text('phone.label'), '+237650000001');
  await press(text('phone.send'));
  await waitFor(() => texts().includes(text('contact_code.title')), 'code entry');
  await type(text('contact_code.label'), '123456');
  await press(text('contact_code.confirm'));
  await waitFor(() => texts().includes(text('errors.refresh_failed')), 'refresh failure');
  expect(texts()).not.toContain(text('receipt.title'));
  await press(text('common.try_again'));
  await waitFor(() => texts().includes(text('receipt.title')), 'receipt');
  await view.unmount();
}, 60000);

test('a refused answer without a code shows the server message and stays on the questions', async () => {
  const session = fixture('questionnaire-session');
  const api = contactApi({ sessions: [session], submits: ['questionnaire-hidden-answer'] });
  const view = await open(api);
  const { texts, press, waitFor } = view;
  await waitFor(() => texts().includes(text('questions.title')), 'questionnaire');
  await press('Employed');
  await view.type('Employer name', 'Acme');
  await press(text('questions.choose_country'));
  await view.type('Country of residence', 'cm');
  await press('Cameroon');
  await view.type('Date of birth', '1990-01-31');
  await press(session.data.profile.form_schema.find((q: { key: string }) => q.key === 'terms').label);
  await press(text('questions.send'));
  const refused = fixture('questionnaire-hidden-answer');
  await waitFor(() => texts().includes(refused.errors['fields.employer'][0]) && texts().includes(refused.message), 'server message');
  expect(texts()).toContain(text('rejection.action.retry'));
  expect(texts()).toContain(text('rejection.help', { verifier }));
  await press(text('rejection.action.retry'));
  expect(texts()).toContain(text('questions.title'));
  expect(texts()).toContain(text('questions.send'));
  await view.unmount();
}, 60000);

test('a case the server closed after the last submission shows the receipt', async () => {
  const api = contactApi({ sessions: [fixture('requirement-added-session')], closedGets: [2] });
  global.fetch = api.fetcher as unknown as typeof fetch;
  const onSubmitted = jest.fn((info: SessionInfo) => info.status);
  const onClosed = jest.fn();
  let renderer: ReactTestRenderer.ReactTestRenderer;
  await ReactTestRenderer.act(async () => {
    renderer = ReactTestRenderer.create(<CredflareVerification autoStart onClose={() => {}} onSubmitted={onSubmitted} onClosed={onClosed} sessionProvider={descriptor} />);
  });
  const { texts, press, waitFor } = helpers(() => renderer!);
  const { type } = inputs(() => renderer!);
  await waitFor(() => texts().includes(text('phone.title')), 'phone step');
  await type(text('phone.label'), '+237650000001');
  await press(text('phone.send'));
  await waitFor(() => texts().includes(text('contact_code.title')), 'code entry');
  await type(text('contact_code.label'), '123456');
  await press(text('contact_code.confirm'));
  await waitFor(() => texts().includes(text('receipt.title')), 'receipt');
  expect(texts()).toContain(text('receipt.phone'));
  expect(texts()).not.toContain(text('errors.refresh_failed'));
  expect(onSubmitted).not.toHaveBeenCalled();
  expect(onClosed).toHaveBeenCalledTimes(1);
  await ReactTestRenderer.act(async () => renderer!.unmount());
}, 60000);

const base = fixture('questionnaire-session');
const schema: Question[] = base.data.profile.form_schema;
const withSchema = (questions: Question[]) => ({ ...base, data: { ...base.data, profile: { ...base.data.profile, form_schema: questions } } });
const asked = (key: string) => schema.find(question => question.key === key)!;

test('a follow up questionnaire uses the answers sent before it', async () => {
  const first = withSchema(schema.filter(question => question.key !== 'employer'));
  const api = contactApi({ sessions: [first, withSchema([asked('employer')]), completed('questionnaire-session')] });
  const view = await open(api);
  const { texts, press, waitFor, type } = view;
  await waitFor(() => texts().includes(text('questions.title')), 'questionnaire');
  await press('Employed');
  await press(text('questions.choose_country'));
  await type('Country of residence', 'cm');
  await press('Cameroon');
  await type('Date of birth', '1990-01-31');
  await press(asked('terms').label);
  await press(text('questions.send'));
  await waitFor(() => texts().includes('Employer name'), 'follow up question');
  await type('Employer name', 'Acme');
  await press(text('questions.send'));
  await waitFor(() => texts().includes(text('receipt.title')), 'receipt');
  const submits = api.calls.filter(call => call.url.endsWith('/submit')).map(call => (call.body as { fields: unknown }).fields);
  expect(submits[1]).toEqual({ employer: 'Acme' });
  await view.unmount();
}, 60000);

test('numbers are sent exactly as typed and the number keyboard allows a sign', async () => {
  const income = { ...asked('income'), show_if: null, min: null, max: null };
  const api = contactApi({ sessions: [withSchema([income]), completed('questionnaire-session')] });
  const view = await open(api);
  await view.waitFor(() => view.texts().includes(text('questions.title')), 'questionnaire');
  expect(view.field('Yearly income').props.keyboardType).toBe('numbers-and-punctuation');
  await view.type('Yearly income', '9007199254740993');
  await view.press(text('questions.send'));
  await view.waitFor(() => view.texts().includes(text('receipt.title')), 'receipt');
  expect(api.calls.find(call => call.url.endsWith('/submit'))!.body).toEqual({ type: 'form_submission', fields: { income: '9007199254740993' } });
  await view.unmount();
}, 60000);

test('a question keyed constructor renders and is validated like any other', async () => {
  const api = contactApi({ sessions: [withSchema([{ ...asked('employer'), key: 'constructor', show_if: null }]), completed('questionnaire-session')] });
  const view = await open(api);
  await view.waitFor(() => view.texts().includes('Employer name'), 'questionnaire');
  await view.press(text('questions.send'));
  expect(view.texts()).toContain(text('questions.required'));
  await view.type('Employer name', 'Acme');
  await view.press(text('questions.send'));
  await view.waitFor(() => view.texts().includes(text('receipt.title')), 'receipt');
  expect(api.calls.find(call => call.url.endsWith('/submit'))!.body).toEqual({ type: 'form_submission', fields: { constructor: 'Acme' } });
  await view.unmount();
}, 60000);

test('questions and rejections work on runtimes without Object.hasOwn', async () => {
  const hasOwn = Object.hasOwn;
  delete (Object as { hasOwn?: unknown }).hasOwn;
  try {
    const api = contactApi({ sessions: [withSchema([asked('employment'), asked('employer')]), completed('questionnaire-session')], submits: ['rejections/phone.not_configured'] });
    const view = await open(api);
    await view.waitFor(() => view.texts().includes(text('questions.title')), 'questionnaire');
    await view.press('Employed');
    await view.type('Employer name', 'Acme');
    await view.press(text('questions.send'));
    await view.waitFor(() => view.texts().includes(text('rejection.phone_not_configured.title', { verifier })), 'mapped rejection');
    await view.unmount();
  } finally {
    Object.hasOwn = hasOwn;
  }
}, 60000);

test('founders are entered as names plus the applicant toggle', async () => {
  const founders = { ...asked('employer'), key: 'founders', label: 'Founders', type: 'founders', show_if: null };
  const api = contactApi({ sessions: [withSchema([founders]), completed('questionnaire-session')] });
  const view = await open(api);
  await view.waitFor(() => view.texts().includes('Founders'), 'questionnaire');
  await view.press(text('questions.send'));
  expect(view.texts()).toContain(text('questions.required'));
  await view.press(text('questions.founders_add'));
  await view.type('Founders 1', ' Ada Lovelace ');
  await view.press(text('questions.founders_add'));
  await view.press(text('questions.founders_includes_me'));
  await view.press(text('questions.send'));
  await view.waitFor(() => view.texts().includes(text('receipt.title')), 'receipt');
  expect(api.calls.find(call => call.url.endsWith('/submit'))!.body).toEqual({ type: 'form_submission', fields: { founders: { includes_applicant: true, names: ['Ada Lovelace'] } } });
  await view.unmount();
}, 60000);

test('an answer sent before a refresh still reveals its follow up question', async () => {
  const api = contactApi({ sessions: [fixture('questionnaire-earlier-answers-session'), completed('questionnaire-session')] });
  const view = await open(api);
  await view.waitFor(() => view.texts().includes('Employer name'), 'follow up question');
  await view.type('Employer name', 'Acme');
  await view.press(text('questions.send'));
  await view.waitFor(() => view.texts().includes(text('receipt.title')), 'receipt');
  expect(api.calls.find(call => call.url.endsWith('/submit'))!.body).toEqual({ type: 'form_submission', fields: { employer: 'Acme' } });
  await view.unmount();
}, 60000);

test('clearing an answer asked again hides its follow up and clears it on the server', async () => {
  const sources = asked('sources');
  const session = withSchema([sources, asked('sources_other')]);
  const api = contactApi({ sessions: [{ ...session, data: { ...session.data, profile: { ...session.data.profile, form_answers: { sources: ['Other'] } } } }, completed('questionnaire-session')] });
  const view = await open(api);
  await view.waitFor(() => view.texts().includes('Other source of funds'), 'prefilled follow up');
  await view.press('Other');
  expect(view.texts()).not.toContain('Other source of funds');
  await view.press(text('questions.send'));
  await view.waitFor(() => view.texts().includes(text('receipt.title')), 'receipt');
  expect(api.calls.find(call => call.url.endsWith('/submit'))!.body).toEqual({ type: 'form_submission', fields: { sources: null } });
  await view.unmount();
}, 60000);

test('a revealed question the SDK cannot ask hands the form to the host', async () => {
  const onHostActionRequired = jest.fn();
  const onClose = jest.fn();
  const revealing = withSchema([asked('employment'), { ...asked('employer'), type: 'signature' }]);
  const api = contactApi({ sessions: [{ ...revealing, data: { ...revealing.data, profile: { ...revealing.data.profile, verification_requirements: [] } } }] });
  global.fetch = api.fetcher as unknown as typeof fetch;
  let renderer: ReactTestRenderer.ReactTestRenderer;
  await ReactTestRenderer.act(async () => {
    renderer = ReactTestRenderer.create(<CredflareVerification autoStart onClose={onClose} onHostActionRequired={onHostActionRequired} sessionProvider={descriptor} />);
  });
  const { texts, press, waitFor } = helpers(() => renderer!);
  await waitFor(() => texts().includes(text('questions.title')), 'questionnaire');
  await press('Employed');
  await waitFor(() => texts().includes(text('receipt.host_steps')), 'host steps');
  expect(api.calls.filter(call => call.url.endsWith('/submit'))).toHaveLength(0);
  await press(text('common.return_to_app'));
  expect(onHostActionRequired).toHaveBeenCalledWith({ code: null });
  await ReactTestRenderer.act(async () => renderer!.unmount());
}, 60000);

test('fuzzy conditions work without TextEncoder', async () => {
  const encoder = globalThis.TextEncoder;
  delete (globalThis as { TextEncoder?: unknown }).TextEncoder;
  try {
    const employer = { ...asked('employer'), show_if: null };
    const follow = { ...asked('income'), show_if: { conditions: [{ path: 'form.employer', op: 'fuzzy_match', value: { text: 'Acme Corporation', min_score: 80 } }] } };
    const api = contactApi({ sessions: [withSchema([employer, follow])] });
    const view = await open(api);
    await view.waitFor(() => view.texts().includes('Employer name'), 'questionnaire');
    await view.type('Employer name', 'acme corporation');
    expect(view.texts()).toContain('Yearly income (Optional)');
    await view.unmount();
  } finally {
    globalThis.TextEncoder = encoder;
  }
}, 60000);

test('changing an earlier answer so it reveals a question the SDK cannot ask hands the form to the host once', async () => {
  const onHostActionRequired = jest.fn();
  const revealing = withSchema([asked('employment'), { ...asked('employer'), type: 'signature' }]);
  const session = { ...revealing, data: { ...revealing.data, profile: { ...revealing.data.profile, verification_requirements: [], form_answers: { employment: 'Student' } } } };
  const api = contactApi({ sessions: [session] });
  global.fetch = api.fetcher as unknown as typeof fetch;
  const onClose = jest.fn();
  let renderer: ReactTestRenderer.ReactTestRenderer;
  await ReactTestRenderer.act(async () => {
    renderer = ReactTestRenderer.create(<CredflareVerification autoStart onClose={onClose} onHostActionRequired={onHostActionRequired} sessionProvider={descriptor} />);
  });
  const { texts, press, waitFor } = helpers(() => renderer!);
  await waitFor(() => texts().includes(text('questions.title')), 'questionnaire');
  await press('Employed');
  await waitFor(() => texts().includes(text('common.return_to_app')), 'host hand back');
  expect(texts()).toContain(text('receipt.host_steps'));
  expect(api.calls.filter(call => call.url.endsWith('/submit'))).toHaveLength(0);
  await press(text('common.return_to_app'));
  expect(onHostActionRequired).toHaveBeenCalledWith({ code: null });
  expect(onClose).toHaveBeenCalledTimes(1);
  await ReactTestRenderer.act(async () => renderer!.unmount());
}, 30000);

test('an optional country or single choice asked again can be cleared and is sent as null', async () => {
  const country = { ...asked('country'), required: false, show_if: null };
  const employment = { ...asked('employment'), required: false, show_if: null };
  const form = withSchema([country, employment]);
  const api = contactApi({ sessions: [{ ...form, data: { ...form.data, profile: { ...form.data.profile, form_answers: { country: 'DE', employment: 'Student' } } } }, completed('questionnaire-session')] });
  const view = await open(api);
  await view.waitFor(() => view.texts().includes('Germany'), 'prefilled country');
  const remove = text('questions.founders_remove');
  expect(view.texts().filter(value => value === remove)).toHaveLength(2);
  await view.press(remove);
  expect(view.texts()).not.toContain('Germany');
  expect(view.texts()).toContain(text('questions.choose_country'));
  await view.press(remove);
  expect(view.texts()).not.toContain(remove);
  await view.press(text('questions.send'));
  await view.waitFor(() => view.texts().includes(text('receipt.title')), 'receipt');
  expect(api.calls.find(call => call.url.endsWith('/submit'))!.body).toEqual({ type: 'form_submission', fields: { country: null, employment: null } });
  await view.unmount();
}, 30000);

test('a required choice offers no way to clear it', async () => {
  const form = withSchema([{ ...asked('employment'), required: true, show_if: null }]);
  const api = contactApi({ sessions: [{ ...form, data: { ...form.data, profile: { ...form.data.profile, form_answers: { employment: 'Student' } } } }] });
  const view = await open(api);
  await view.waitFor(() => view.texts().includes(text('questions.title')), 'questionnaire');
  expect(view.texts()).not.toContain(text('questions.founders_remove'));
  await view.unmount();
}, 30000);

test('Leave on a questionnaire rejection hands back to the host with the rejection code', async () => {
  const onHostActionRequired = jest.fn();
  const onCancelled = jest.fn();
  const onClose = jest.fn();
  const api = contactApi({ sessions: [withSchema([asked('employment')])], submits: ['rejections/phone.not_configured'] });
  global.fetch = api.fetcher as unknown as typeof fetch;
  let renderer: ReactTestRenderer.ReactTestRenderer;
  await ReactTestRenderer.act(async () => {
    renderer = ReactTestRenderer.create(<CredflareVerification autoStart onClose={onClose} onCancelled={onCancelled} onHostActionRequired={onHostActionRequired} sessionProvider={descriptor} />);
  });
  const { texts, press, pressLast, waitFor } = helpers(() => renderer!);
  await waitFor(() => texts().includes(text('questions.title')), 'questionnaire');
  await press('Student');
  await press(text('questions.send'));
  await waitFor(() => texts().includes(text('rejection.phone_not_configured.title', { verifier })), 'rejection');
  await pressLast(text('rejection.action.leave'));
  expect(onHostActionRequired).toHaveBeenCalledWith({ code: 'phone.not_configured' });
  expect(onCancelled).not.toHaveBeenCalled();
  expect(onClose).toHaveBeenCalledTimes(1);
  await ReactTestRenderer.act(async () => renderer!.unmount());
}, 30000);

test('closing from a questionnaire rejection reports its code, never a cancellation', async () => {
  const onHostActionRequired = jest.fn();
  const onCancelled = jest.fn();
  const onClose = jest.fn();
  const api = contactApi({ sessions: [withSchema([asked('employment')])], submits: ['rejections/phone.not_configured'] });
  global.fetch = api.fetcher as unknown as typeof fetch;
  let renderer: ReactTestRenderer.ReactTestRenderer;
  await ReactTestRenderer.act(async () => {
    renderer = ReactTestRenderer.create(<CredflareVerification autoStart onClose={onClose} onCancelled={onCancelled} onHostActionRequired={onHostActionRequired} sessionProvider={descriptor} />);
  });
  const { texts, press, waitFor } = helpers(() => renderer!);
  await waitFor(() => texts().includes(text('questions.title')), 'questionnaire');
  await press('Student');
  await press(text('questions.send'));
  await waitFor(() => texts().includes(text('rejection.phone_not_configured.title', { verifier })), 'rejection');
  await press(text('common.close'));
  await press(text('exit.leave'));
  expect(onHostActionRequired).toHaveBeenCalledWith({ code: 'phone.not_configured' });
  expect(onCancelled).not.toHaveBeenCalled();
  expect(onClose).toHaveBeenCalledTimes(1);
  await ReactTestRenderer.act(async () => renderer!.unmount());
}, 30000);
