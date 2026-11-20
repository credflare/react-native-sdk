# CredFlare React Native SDK

Development SDK with a typed applicant client, a session-provider hook and native document capture. Requires the scoped-session backend changes. No WebView is used. This package is not published. The initial compatibility target is React Native 0.88.1 with React 19.3.0.

## Development setup

Check out `javascript-sdk` beside this repository, install its dependencies and run its build. Then run `npm ci` here and `npm run typecheck`. The development dependency currently uses that sibling checkout.

```sh
cd ../javascript-sdk
npm ci
npm run build
cd ../react-native-sdk
npm ci
npm run typecheck
```

## Native document collection

```tsx
import {CredflareSession, CredflareDocumentCapture} from '@credflare/sdk-react-native';

const session = new CredflareSession(descriptorFromYourBackend);
const info = await session.get();

<CredflareDocumentCapture
  session={session}
  requirement={selectedRequirement}
  maxFileSizeBytes={info.upload_limits.max_file_size_bytes}
  allowedFileTypes={info.upload_limits.allowed_file_types}
  onSubmitted={submissionId => showDocumentReceipt(submissionId)}
/>;
```

The component collects the requested sides, provides previews and retakes, and preserves upload IDs and retry keys after a failed send. It refuses trusted-camera requirements. `onSubmitted` means one document was received, not that the applicant was verified or that every requirement is complete.

Your host UI selects requirements from the session response and refreshes them after each submission. Preserve grouped document alternatives. Use the session client for requested form, facial-photo and location data. Liveness and deepfake detection are not available.

`useCredflareSession(provider)` fetches a descriptor from your authenticated backend and exposes `session`, `info`, `loading`, `error` and `load`. Concurrent loads share one operation. The provider must always refer to the same verification case. Calling `load` again lets the host request a replacement session while retaining the client object. Keep the capture component mounted to preserve its retry state.

Client errors expose `status`, `type` and validation `errors`. Use `session.cancel()` only when intentionally revoking applicant access; it preserves the case. Closing an image picker leaves the current selections intact.

## App configuration

Add `react-native-image-picker`, `@react-native-documents/picker` and `react-native-get-random-values` as direct app dependencies so the native modules are linked. Run pod installation for iOS. Add `NSCameraUsageDescription` and `NSPhotoLibraryUsageDescription` to the app's Info.plist. This photo-only flow does not require microphone permission.

If the Android app declares camera permission independently, it must request that permission before opening capture. Keep client credentials on the server. Treat session descriptors as temporary credentials and keep them out of logs and persistent storage.

## Example

Run the JavaScript repository's local demo backend on port 3107. Press Start in the app to create a fresh session automatically. The session setup controls disappear when the guided flow starts.

```sh
cd example
npm start
npm run ios
```

For Android, run `npm run android` with the Android SDK and JDK configured. When using a local API on the Android emulator, forward its port with `adb reverse tcp:8000 tcp:8000` and return a loopback API URL in the descriptor.

See [flow requirements](docs/SDK-FLOW.md) for the remaining guided-flow and physical-device release requirements.

## Guided flow

Use `<CredflareVerification sessionProvider={provider} onClose={close} />`. Your provider returns a session from the host application's authenticated backend. The component selects documents, guides capture, reviews evidence and refreshes remaining requirements after submission. Forms and location checks still need a host flow.

Each document has its own rule. For example, require a camera photo of an ID and an uploaded bank statement in one profile. `either` allows one source per side, `snapshot` requires a camera photo, `upload` requires a saved file, and `snapshot_and_upload` requires both sources of the same document. Camera source is client-reported, not proof of a trusted camera feed.

The file picker supports permitted images, PDFs and DOCX files. Bundle the Ubuntu font files from `assets/fonts` into the host app's native font resources, as in the example. The SDK supplies light and dark themes.

Run `npm run validate` for the JavaScript build, TypeScript checks and native screen tests. Run native builds separately with the configured SDKs.

## Upload test files

Synthetic front and back PNGs are in the sibling JavaScript SDK at `test/fixtures/documents`. Android demo files are available under Downloads > Credflare-Samples. The iOS example enables local document sharing so files placed in its Documents directory appear in Files under On My iPhone. Use the Upload-Samples folder in either demo app. These are test documents, not real identity records.

## Developer-configured facial collection

Choose the compliance profile on your server when creating the case. The recipient does not choose a profile or verification mode. The SDK collects outstanding documents first, then opens the selfie step only when the case requests `facial_verification`. Selfie-only cases go directly to that step. Document alternatives and capture-source choices follow the server's requirement rules.

The selfie step uses the front camera, provides a preview and retake action, and sends only after confirmation. Uploads use the scoped biometric endpoint; facial submissions reference the uploaded file ID. Retrying a send reuses its upload and submission keys. A receipt confirms collection for review, not a face match or liveness result.

The backend currently reports liveness, trusted camera and deepfake detection as unavailable. Automated face matching and validated liveness processing are not implemented by this capture interface. Forms and location checks return control to the host app. Example apps obtain their requirements from the demo server without a recipient-facing profile selector.
