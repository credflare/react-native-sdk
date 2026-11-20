import React from 'react';
import {Button, Text, TextInput} from 'react-native';
import ReactTestRenderer from 'react-test-renderer';
import App from '../App';

test('requires a session and reports invalid input without opening capture', async () => {
  let renderer: ReactTestRenderer.ReactTestRenderer;
  await ReactTestRenderer.act(async () => {renderer = ReactTestRenderer.create(<App/>);});
  expect(renderer!.root.findByType(Button).props.title).toBe('Load session');
  await ReactTestRenderer.act(async () => {renderer!.root.findByType(TextInput).props.onChangeText('{');});
  await ReactTestRenderer.act(async () => {await renderer!.root.findByType(Button).props.onPress();});
  const alert = renderer!.root.findAllByType(Text).find(node => node.props.accessibilityRole === 'alert');
  expect(alert?.props.children.length).toBeGreaterThan(0);
  expect(renderer!.root.findAllByType(Button)).toHaveLength(1);
});
