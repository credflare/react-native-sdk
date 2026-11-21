import React from 'react';
import { Text, TextInput } from 'react-native';
import ReactTestRenderer from 'react-test-renderer';
import { Response } from 'whatwg-fetch';
import App from '../App';
const fixture = require('../../../javascript-sdk/test/fixtures/capture-snapshot_and_upload.json');

test('starts a combined flow without session entry and opens the camera step', async () => {
  const fetcher = jest.fn(
    async (_url: string, options?: RequestInit) =>
      new Response(
        JSON.stringify(
          options?.method === 'POST'
            ? {
                session_id: fixture.data.session_id,
                token: 'test-session-token',
                api_base_url: 'https://api.example.test/api/v1',
                expires_at: fixture.data.expires_at,
              }
            : fixture,
        ),
        { status: 200 },
      ),
  );
  global.fetch = fetcher as typeof fetch;
  let renderer: ReactTestRenderer.ReactTestRenderer;
  await ReactTestRenderer.act(async () => {
    renderer = ReactTestRenderer.create(<App />);
  });
  const press = async (label: string) => {
    const text = renderer!.root
      .findAllByType(Text)
      .find(node => node.props.children === label)!;
    let node = text.parent!;
    while (!node.props.onPress) node = node.parent!;
    await ReactTestRenderer.act(async () => {
      await node.props.onPress();
    });
  };
  expect(renderer!.root.findAllByType(TextInput)).toHaveLength(0);
  await press('Start');
  expect(JSON.parse(fetcher.mock.calls[0][1]!.body as string).mode).toBeUndefined();
  expect(
    renderer!.root
      .findAllByType(Text)
      .some(n => n.props.children === 'Follow the steps requested by your verifier. Review each item before you send it.'),
  ).toBe(false);
  const texts = () => renderer!.root.findAllByType(Text).map(n => n.props.children);
  expect(texts()).toContain(fixture.data.requester.name);
  expect(texts()).toContain('Test mode');
  expect(texts()).toContain('Secured by Credflare');
  expect(texts()).toContain('Photo and saved file');
  await press(fixture.data.profile.document_requirements[0].document_type.name);
  expect(
    renderer!.root
      .findAllByType(Text)
      .some(n => n.props.children === 'Front'),
  ).toBe(true);
  expect(
    renderer!.root
      .findAllByType(Text)
      .some(n => n.props.children === 'Camera photo'),
  ).toBe(true);
  expect(
    renderer!.root
      .findAllByType(Text)
      .some(n => n.props.children === 'Credflare'),
  ).toBe(false);
  expect(
    renderer!.root
      .findAllByType(Text)
      .some(n => n.props.children === 'Choose a file'),
  ).toBe(false);
  await ReactTestRenderer.act(async () => renderer!.unmount());
}, 30000);
