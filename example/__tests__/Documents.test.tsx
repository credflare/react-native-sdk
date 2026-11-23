import React from 'react';
import ReactTestRenderer from 'react-test-renderer';
import { Response } from 'whatwg-fetch';
import { pick } from '@react-native-documents/picker';
import type { DocumentPickerResponse } from '@react-native-documents/picker';
import { text } from '@credflare/sdk-javascript';
import { CredflareVerification } from '@credflare/sdk-react-native';
import { descriptor, fixture, helpers } from '../test-support/flow-harness';

const picked = (name: string): DocumentPickerResponse => ({
  uri: `file:///tmp/${name}`,
  name,
  error: null,
  type: 'image/png',
  nativeType: 'public.png',
  size: fixture('upload').data.size,
  isVirtual: false,
  convertibleToMimeTypes: null,
  hasRequestedType: true,
});

test('a document submission refused because the case closed ends on the receipt', async () => {
  const base = fixture('session');
  const session = { ...base, data: { ...base.data, profile: { ...base.data.profile, form_schema: null } } };
  const calls: string[] = [];
  const json = (status: number, value: unknown) => new Response(JSON.stringify(value), { status, headers: { 'Content-Type': 'application/json' } });
  global.fetch = jest.fn(async (url: string, init?: RequestInit) => {
    calls.push(`${init?.method ?? 'GET'} ${url.replace(/^.*\/sessions\/[^/]+/, '')}`);
    if (!init?.method || init.method === 'GET') return json(200, session);
    if (url.endsWith('/uploads/documents')) return json(201, fixture('upload'));
    if (url.endsWith('/submit')) return json(409, fixture('session-closed'));
    return json(404, { success: false, message: 'Not found' });
  }) as unknown as typeof fetch;
  (pick as jest.Mock).mockResolvedValueOnce([picked('front.png')]).mockResolvedValueOnce([picked('back.png')]);
  const onClosed = jest.fn();
  let renderer: ReactTestRenderer.ReactTestRenderer;
  await ReactTestRenderer.act(async () => {
    renderer = ReactTestRenderer.create(<CredflareVerification autoStart onClose={() => {}} onClosed={onClosed} sessionProvider={descriptor} />);
  });
  const { texts, press, waitFor } = helpers(() => renderer!);
  const name = session.data.profile.document_requirements[0].document_type.name;
  await waitFor(() => texts().includes(name), 'documents list');
  await press(name);
  await press(text('capture.choose_file'));
  await waitFor(() => texts().includes(text('common.continue')), 'front chosen');
  await press(text('common.continue'));
  await press(text('capture.choose_file'));
  await waitFor(() => texts().includes(text('review.title')), 'back chosen');
  await press(text('review.title'));
  await waitFor(() => texts().includes(text('review.send')), 'review');
  await press(text('review.send'));
  await waitFor(() => texts().includes(text('receipt.title')), 'receipt');
  expect(onClosed).toHaveBeenCalledTimes(1);
  expect(texts()).not.toContain(text('review.send'));
  expect(calls.filter(call => call.endsWith('/submit'))).toHaveLength(1);
  await ReactTestRenderer.act(async () => renderer!.unmount());
}, 30000);
