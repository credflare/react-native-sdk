import React from 'react';
import { Text, TextInput } from 'react-native';
import ReactTestRenderer from 'react-test-renderer';
import { Response } from 'whatwg-fetch';
import { CredflareVerification } from '../../src/verification-flow';
const initial = require('../../../javascript-sdk/test/fixtures/facial-session.json');

test('the server requests a selfie without exposing a profile or gallery choice', async () => {
  global.fetch = jest.fn(
    async () => new Response(JSON.stringify(initial), { status: 200 }),
  ) as typeof fetch;
  let renderer: ReactTestRenderer.ReactTestRenderer;
  await ReactTestRenderer.act(async () => {
    renderer = ReactTestRenderer.create(
      <CredflareVerification
        autoStart
        onClose={() => {}}
        sessionProvider={async () => ({
          session_id: initial.data.session_id,
          api_base_url: 'https://api.example.test/api/v1',
          token: 'test-session-token',
          expires_at: initial.data.expires_at,
        })}
      />,
    );
  });
  const texts = renderer!.root
    .findAllByType(Text)
    .map(node => node.props.children);
  expect(texts).toContain('Take a selfie');
  expect(texts).toContain('Open front camera');
  expect(texts).not.toContain('Choose a file');
  expect(texts).not.toContain('Documents requested');
  expect(texts).not.toContain('Evidence received');
  expect(renderer!.root.findAllByType(TextInput)).toHaveLength(0);
  await ReactTestRenderer.act(async () => renderer!.unmount());
});
