import React from 'react';
import { Modal, ScrollView, StyleSheet, Text, View } from 'react-native';
import ReactTestRenderer from 'react-test-renderer';
import { CredflareVerification } from '../../src/verification-flow';
import { descriptor, fakeApi, fixture, helpers } from '../test-support/flow-harness';

const style = (node: ReactTestRenderer.ReactTestInstance) => StyleSheet.flatten(node.props.style) ?? {};

async function render(session: string) {
  const api = fakeApi({ session });
  global.fetch = api.fetcher as unknown as typeof fetch;
  let renderer: ReactTestRenderer.ReactTestRenderer;
  await ReactTestRenderer.act(async () => {
    renderer = ReactTestRenderer.create(
      <CredflareVerification autoStart onClose={() => {}} sessionProvider={descriptor} />,
    );
  });
  return { renderer: renderer!, ...helpers(() => renderer!) };
}

test('the header centres the requester name over the test mode badge and lets a long name wrap', async () => {
  const { renderer, texts, waitFor } = await render('capture-snapshot_and_upload');
  const name = fixture('capture-snapshot_and_upload').data.requester.name;
  await waitFor(() => texts().includes('Documents requested'), 'documents');
  const label = renderer.root.findAllByType(Text).find(node => node.props.children === name)!;
  expect(label.props.numberOfLines).toBeUndefined();
  expect(style(label).textAlign).toBe('center');
  const badge = renderer.root.findAllByType(Text).find(node => node.props.children === 'Test mode')!;
  const column = (node: ReactTestRenderer.ReactTestInstance) => {
    let at = node.parent;
    while (at && !(at.type === View && style(at).flex === 1)) at = at.parent;
    return at;
  };
  expect(column(badge)).toBe(column(label));
  expect(style(column(label)!).alignItems).toBe('center');
  const close = renderer.root.findAllByType(Text).find(node => node.props.children === 'Close')!;
  expect(column(close)).not.toBe(column(label));
  await ReactTestRenderer.act(async () => renderer.unmount());
}, 30000);

test('the country list opens as a page sheet and the page scrolls clear of the keyboard', async () => {
  const { renderer, texts, waitFor, press } = await render('questionnaire-session');
  await waitFor(() => texts().includes('Answer a few questions'), 'questions');
  await press('Choose a country');
  const sheet = renderer.root.findAllByType(Modal).find(node => node.props.visible)!;
  expect(sheet.props.presentationStyle).toBe('pageSheet');
  const page = renderer.root.findAllByType(ScrollView)[0];
  expect(page.props.automaticallyAdjustKeyboardInsets).toBe(true);
  expect(page.props.keyboardDismissMode).toBe('interactive');
  await ReactTestRenderer.act(async () => renderer.unmount());
}, 30000);
