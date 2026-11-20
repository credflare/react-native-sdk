import React, {useState} from 'react';
import {Button, ScrollView, Text, TextInput} from 'react-native';
import {SafeAreaProvider, SafeAreaView, initialWindowMetrics} from 'react-native-safe-area-context';
import {CredflareSession, CredflareDocumentCapture} from '@credflare/sdk-react-native';
import type {SessionInfo} from '@credflare/sdk-react-native';

export default function App() {
  const [input,setInput] = useState('');
  const [session,setSession] = useState<CredflareSession>();
  const [info,setInfo] = useState<SessionInfo>();
  const [message,setMessage] = useState('');
  const [busy,setBusy] = useState(false);
  async function load() {
    setBusy(true);setMessage('');
    try {
      const next = new CredflareSession(JSON.parse(input));
      const metadata = await next.get();
      setSession(next);setInfo(metadata);setInput('');
    } catch (error) {setMessage(error instanceof Error ? error.message : 'Could not load session.');}
    finally {setBusy(false);}
  }
  const requirement = info?.profile?.document_requirements[0];
  return <SafeAreaProvider initialMetrics={initialWindowMetrics}><SafeAreaView style={{flex:1,backgroundColor:"white"}}><ScrollView contentContainerStyle={{padding:24,gap:16}}>
    <Text accessibilityRole="header">CredFlare SDK example</Text>
    <Text>Paste a short-lived session descriptor from your backend. Never paste a client secret. This example collects one document at a time.</Text>
    <TextInput accessibilityLabel="Session JSON" multiline value={input} onChangeText={setInput} autoCorrect={false} autoCapitalize="none" style={{borderWidth:1,minHeight:120,padding:8}}/>
    <Button title="Load session" disabled={busy} onPress={load}/>
    {message && <Text accessibilityRole="alert">{message}</Text>}
    {info && <Text>Environment: {info.environment}</Text>}
    {session && requirement && <CredflareDocumentCapture key={`${info!.session_id}:${requirement.document_type.id}`} session={session} requirement={requirement} maxFileSizeBytes={info!.upload_limits.max_file_size_bytes} allowedFileTypes={info!.upload_limits.allowed_file_types} onSubmitted={id => setMessage(`Document submitted for review. Submission ${id}. This is not a verification decision.`)}/>}
    {session && !requirement && <Text>No outstanding documents. Use the session client for other requested checks.</Text>}
  </ScrollView></SafeAreaView></SafeAreaProvider>;
}
