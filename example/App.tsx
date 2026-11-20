import React, {useState} from 'react';
import {ScrollView, View} from 'react-native';
import {SafeAreaProvider, SafeAreaView, initialWindowMetrics} from 'react-native-safe-area-context';
import {CredflareVerification} from '@credflare/sdk-react-native';
import type {SessionDescriptor} from '@credflare/sdk-react-native';
import {Action, Copy, SecuredBy, Title, usePalette} from '../src/ui';
import {ui} from '../src/theme';
function Demo() {
  const p = usePalette(), [started, setStarted] = useState(false);
  async function sessionProvider(): Promise<SessionDescriptor> {
    const response = await fetch('http://localhost:3107/session', {
      method: 'POST', headers: {'Content-Type': 'application/json'},
      body: JSON.stringify({email: 'native-demo@example.test'}),
    });
    if (!response.ok) throw new Error('The local demo backend could not create a session.');
    return response.json();
  }
  if (started) return <CredflareVerification sessionProvider={sessionProvider} autoStart onClose={() => setStarted(false)} />;
  return <View style={[ui.root, {backgroundColor: p.surface}]}><ScrollView contentContainerStyle={ui.page}>
    <Title>Verify your identity</Title>
    <Copy muted>Follow the steps requested by your verifier. Review your documents and selfie before sending.</Copy>
    <Action title="Start verification" onPress={() => setStarted(true)} />
    <Copy small muted>Sandbox demo. The server sets the requirements.</Copy>
    <SecuredBy />
  </ScrollView></View>;
}
export default function App() {
  const p = usePalette();
  return <SafeAreaProvider initialMetrics={initialWindowMetrics}><SafeAreaView style={[ui.root, {backgroundColor: p.surface}]}><Demo /></SafeAreaView></SafeAreaProvider>;
}
