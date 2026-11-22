import React from 'react';
import ReactTestRenderer from 'react-test-renderer';
import { text } from '@credflare/sdk-javascript';
import { CredflareVerification } from '@credflare/sdk-react-native';
import { completed, contactApi, descriptor, fixture, helpers, inputs } from '../test-support/flow-harness';

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
