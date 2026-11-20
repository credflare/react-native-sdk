# CredFlare React Native SDK

Development SDK with a typed applicant client, a session-provider hook and native document capture. Requires the scoped-session backend changes. No WebView is used. This package is not published. The initial compatibility target is React Native 0.88.1 with React 19.3.0.

## Development setup

Check out `sdk-javascript` beside this repository, install its dependencies and run its build. Then run `npm ci` here and `npm run typecheck`. The development dependency currently uses that sibling checkout.

```sh
cd ../sdk-javascript
npm ci
npm run build
cd ../sdk-react-native
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

Client errors expose `status`, `kind` and validation `errors`. Use `session.cancel()` only when intentionally revoking applicant access; it preserves the case. Closing an image picker leaves the current selections intact.

## App configuration

Add `react-native-image-picker` and `react-native-get-random-values` as direct app dependencies so the native modules are linked. Run pod installation for iOS. Add `NSCameraUsageDescription` and `NSPhotoLibraryUsageDescription` to the app's Info.plist. This photo-only flow does not require microphone permission.

If the Android app declares camera permission independently, it must request that permission before opening capture. Keep client credentials on the server. Treat session descriptors as temporary credentials and keep them out of logs and persistent storage.

## Example

Run the JavaScript repository's local example backend and create a temporary session descriptor. Paste it into this example app. The example collects one outstanding document at a time.

```sh
cd example
npm start
npm run ios
```

For Android, run `npm run android` with the Android SDK and JDK configured. When using a local API on the Android emulator, forward its port with `adb reverse tcp:8000 tcp:8000` and return a loopback API URL in the descriptor.

See [flow requirements](docs/SDK-FLOW.md) for the remaining guided-flow and physical-device release requirements.
