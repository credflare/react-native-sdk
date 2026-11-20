import React, { useState } from 'react';
import { Pressable, ScrollView, Text, View } from 'react-native';
import {
  SafeAreaProvider,
  SafeAreaView,
  initialWindowMetrics,
} from 'react-native-safe-area-context';
import { CredflareVerification } from '@credflare/sdk-react-native';
import type { SessionDescriptor } from '@credflare/sdk-react-native';
import { Action, BrandHeader, Copy, usePalette } from '../src/ui';
import { ui } from '../src/theme';
const modes = [
  {
    value: 'either',
    title: 'Photos or files',
    description: 'Choose either method for each requested side.',
  },
  {
    value: 'snapshot_and_upload',
    title: 'Photos and files',
    description: 'Take each side with the camera, then upload each saved side.',
  },
  {
    value: 'snapshot',
    title: 'Camera photos',
    description: 'Take each requested side with the camera.',
  },
  {
    value: 'upload',
    title: 'File uploads',
    description: 'Choose saved document images or PDFs.',
  },
];
function Demo() {
  const p = usePalette(),
    [mode, setMode] = useState('either'),
    [started, setStarted] = useState(false);
  async function sessionProvider(): Promise<SessionDescriptor> {
    const response = await fetch('http://localhost:3107/session', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: 'native-demo@example.test', mode }),
    });
    if (!response.ok)
      throw new Error('The local demo backend could not create a session.');
    return response.json();
  }
  if (started)
    return (
      <CredflareVerification
        sessionProvider={sessionProvider}
        autoStart
        onClose={() => setStarted(false)}
      />
    );
  return (
    <View style={[ui.root, { backgroundColor: p.surface }]}>
      <BrandHeader />
      <ScrollView contentContainerStyle={ui.page}>
        <View style={ui.sectionGap} />
        <Text style={[ui.title, { color: p.ink }]}>
          Try document verification
        </Text>
        <Copy muted>
          Choose a sample flow. A fresh sandbox session is created when you
          start.
        </Copy>
        <View style={ui.sectionGap} />
        {modes.map(option => (
          <Pressable
            accessibilityRole="radio"
            accessibilityState={{ checked: mode === option.value }}
            key={option.value}
            onPress={() => setMode(option.value)}
            style={[
              ui.option,
              {
                borderColor: mode === option.value ? p.primary : p.border,
                backgroundColor: mode === option.value ? p.soft : p.surface,
              },
            ]}
          >
            <Text style={[ui.subtitle, { color: p.ink }]}>{option.title}</Text>
            <Copy muted>{option.description}</Copy>
          </Pressable>
        ))}
        <View style={ui.sectionGap} />
        <Action title="Start verification" onPress={() => setStarted(true)} />
        <Copy small muted style={{ textAlign: 'center' }}>
          Sandbox demo. Use sample documents.
        </Copy>
      </ScrollView>
    </View>
  );
}
export default function App() {
  const p = usePalette();
  return (
    <SafeAreaProvider initialMetrics={initialWindowMetrics}>
      <SafeAreaView style={[ui.root, { backgroundColor: p.surface }]}>
        <Demo />
      </SafeAreaView>
    </SafeAreaProvider>
  );
}
