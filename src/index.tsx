import 'react-native-get-random-values';
import React, {useRef, useState} from 'react';
import {Button, Image, Text, View} from 'react-native';
import {launchCamera, launchImageLibrary} from 'react-native-image-picker';
import type {Asset} from 'react-native-image-picker';
import {CredflareSession} from '@credflare/sdk-javascript';
import type {DocumentRequirement} from '@credflare/sdk-javascript';
export {CredflareSession} from '@credflare/sdk-javascript';
export type {SessionDescriptor, SessionInfo, DocumentRequirement} from '@credflare/sdk-javascript';

export function requestKey(): string {
  const bytes = (globalThis as typeof globalThis & {crypto: {getRandomValues<T extends ArrayBufferView>(array: T): T}}).crypto.getRandomValues(new Uint8Array(16));
  bytes[6] = (bytes[6]! & 15) | 64;
  bytes[8] = (bytes[8]! & 63) | 128;
  const hex = Array.from(bytes, b => b.toString(16).padStart(2, '0')).join('');
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
}
interface Capture {asset: Asset & {uri: string}; key: string; fileId?: number}
export interface DocumentCaptureProps {
  session: CredflareSession;
  requirement: DocumentRequirement;
  maxFileSizeBytes: number;
  allowedFileTypes: string[];
  onSubmitted: (submissionId: number) => void;
}
export function CredflareDocumentCapture({session, requirement, maxFileSizeBytes, allowedFileTypes, onSubmitted}: DocumentCaptureProps) {
  const [images, setImages] = useState<Partial<Record<'front' | 'back', Capture>>>({});
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string>();
  const submitKey = useRef<string>('');
  const active = useRef(false);
  const document = requirement.document_type;
  const policy = requirement.capture_method ?? (document.capture_method === 'camera' ? 'either' : 'upload');
  const sides = requirement.requested_sides ?? (document.two_sided ? ['front', 'back'] as const : ['front'] as const);
  async function pick(side: 'front' | 'back', camera: boolean) {
    if (active.current) return;
    active.current = true;
    setBusy(true); setError(undefined);
    try {
      const result = camera
        ? await launchCamera({mediaType:'photo',cameraType:'back',saveToPhotos:false,quality:1})
        : await launchImageLibrary({mediaType:'photo',selectionLimit:1,assetRepresentationMode:'compatible'});
      if (result.didCancel) return;
      if (result.errorCode) throw new Error(result.errorMessage ?? `Image selection failed: ${result.errorCode}`);
      const asset = result.assets?.[0];
      if (!asset?.uri) throw new Error('No image was returned. Please try again.');
      if (asset.fileSize !== undefined && asset.fileSize > maxFileSizeBytes) throw new Error('This image exceeds the workspace upload limit.');
      const extension = asset.fileName?.split('.').pop()?.toLowerCase();
      if (extension && !allowedFileTypes.includes(extension === 'jpeg' ? 'jpg' : extension)) throw new Error('This image type is not allowed by the workspace.');
      setImages(current => ({...current, [side]: {asset: {...asset,uri:asset.uri!},key:requestKey()}}));
      submitKey.current = requestKey();
    } catch (cause) { setError(cause instanceof Error ? cause.message : 'Could not select an image.'); }
    finally { active.current = false; setBusy(false); }
  }
  async function submit() {
    if (active.current) return;
    active.current = true;
    setBusy(true); setError(undefined);
    try {
      for (const side of sides) {
        const image = images[side]!;
        if (image.fileId === undefined) {
          const form = new FormData();
          form.append('side', side);
          form.append('file', {uri:image.asset.uri, name:image.asset.fileName ?? `${side}.jpg`, type:image.asset.type ?? 'image/jpeg'});
          image.fileId = (await session.upload('documents', form, image.key)).id;
        }
      }
      const result = await session.submit({type:'document_verification',document_type_id:document.id,
        file_id:images.front?.fileId ?? images[sides[0]!]!.fileId!,
        ...(sides.includes('back') && sides.length > 1 ? {back_file_id:images.back!.fileId} : {})}, submitKey.current);
      onSubmitted(result.id);
    } catch (cause) { setError(cause instanceof Error ? cause.message : 'Could not send this document.'); }
    finally { active.current = false; setBusy(false); }
  }
  if (!['upload', 'either'].includes(policy)) return <Text>This requirement needs trusted capture, which is not available in this SDK yet.</Text>;
  return <View style={{gap:12}}>
    <Text accessibilityRole="header">{document.name}</Text>
    {sides.map(side => <View key={side} style={{gap:8}}>
      <Text>Document {side}</Text>
      {images[side] && <Image source={{uri:images[side]!.asset.uri}} accessibilityLabel={`Selected ${side} image`} style={{height:160,resizeMode:'contain'}}/>}
      {policy === 'either' && <Button title="Take photo" disabled={busy} onPress={() => pick(side,true)}/>}
      <Button title={images[side] ? 'Replace image' : 'Choose image'} disabled={busy} onPress={() => pick(side,false)}/>
    </View>)}
    {error && <Text accessibilityRole="alert">{error}</Text>}
    <Button title={busy ? 'Sending document…' : 'Submit document'} disabled={busy || !sides.every(side => images[side])} onPress={submit}/>
  </View>;
}

export {useCredflareSession} from './use-session';
