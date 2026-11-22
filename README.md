# CredFlare React Native SDK

Development SDK with a typed applicant client, a session provider hook and native document, liveness and location capture. Requires the scoped-session backend changes. No WebView is used. This package is not published. The initial compatibility target is React Native 0.88.1 with React 19.3.0.

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

Your host UI selects requirements from the session response and refreshes them after each submission. Preserve grouped document alternatives. The guided flow below also collects liveness and location.

`useCredflareSession(provider)` fetches a descriptor from your authenticated backend and exposes `session`, `info`, `loading`, `error` and `load`. Concurrent loads share one operation. The provider must always refer to the same verification case. Calling `load` again lets the host request a replacement session while retaining the client object. Keep the capture component mounted to preserve its retry state.

Client errors expose `status`, `type` and validation `errors`. Use `session.cancel()` only when intentionally revoking applicant access; it preserves the case. Closing an image picker leaves the current selections intact.

## App configuration

Add these as direct app dependencies so their native modules are linked:

| Package | Version | Used for |
| --- | --- | --- |
| `react-native-image-picker` | 8.3.0 | Document photos |
| `@react-native-documents/picker` | 12.1.0 | Saved files |
| `react-native-get-random-values` | 2.1.0 | Request keys |
| `react-native-vision-camera` | 5.2.4 | Liveness preview, gesture frames, video and selfie |
| `react-native-nitro-modules` | 0.37.2 | Required by the camera packages |
| `react-native-nitro-image` | 0.15.2 | Required by the camera |
| `react-native-vision-camera-face-detector` | 2.1.0 | ML Kit face signals as a camera output |
| `react-native-geolocation-service` | 5.3.1 | Location fixes |
| `react-native-svg` | 15.16.1 | Spec icons |

Run pod installation for iOS. The face detector requires iOS 15.5 or later, so set `platform :ios, '15.5'` in the Podfile and the app's deployment target to match. Permissions:

- iOS `Info.plist`: `NSCameraUsageDescription`, `NSPhotoLibraryUsageDescription` and `NSLocationWhenInUseUsageDescription`. Video is recorded without audio, so no microphone permission is needed.
- Android manifest: `android.permission.CAMERA`, `android.permission.ACCESS_FINE_LOCATION` and `android.permission.ACCESS_COARSE_LOCATION`. The SDK requests location at runtime; the camera package requests camera access when liveness starts.

Keep client credentials on the server. Treat session descriptors as temporary credentials and keep them out of logs and persistent storage.

## Example

Run the JavaScript repository's local demo backend on port 3107. Press Start in the app to create a fresh session automatically. The session setup controls disappear when the guided flow starts.

```sh
cd example
npm start
npm run ios
```

For Android, run `npm run android` with the Android SDK and JDK 17 configured. When using a local API on the Android emulator, forward the demo and API ports with `adb reverse tcp:3107 tcp:3107` and `adb reverse tcp:8018 tcp:8018` (or your API port) and return a loopback API URL in the descriptor.

See [flow requirements](docs/SDK-FLOW.md) for the remaining guided-flow and physical-device release requirements.

## Guided flow

Use `<CredflareVerification sessionProvider={provider} onClose={close} />`. Your provider returns a session from the host application's authenticated backend. The component asks the questionnaire, selects documents, guides capture, reviews evidence, then runs the remaining `facial_verification`, `location_verification`, `email_verification` and `phone_verification` requirements in profile order. After every submission and code confirmation it loads the session again: while the case is open and requirements remain (including ones a workflow added during the case) it continues with the next step, otherwise it shows a receipt that lists what was received. If that check fails it asks to try again instead of showing the receipt. Founders questions and other checks are left to the host app, and the receipt says so.

Questions support every type in the spec (`text`, `textarea`, `number`, `date`, `email`, `phone`, `tel`, `select`, `single_select`, `multi_select`, `country` and `consent`). A question whose `show_if` does not match the answers given so far is not shown, not checked and not sent. Countries are picked from a searchable list and sent as ISO codes.

Email and phone steps ask for the address or number, request a code, take the six digit code and confirm it. The resend link counts down from the last request, and phone numbers are sent without spaces, brackets, dots or dashes.

Every rejection with a `code` shows the shared copy from the spec: a title, a message, who requested the evidence, a help line naming the requester and a button for the code's action (try again, start again, enter the code again, send a new code, wait for the resend countdown, or close). A rejection without a known code shows the server message with a retry.

Each document has its own rule. For example, require a camera photo of an ID and an uploaded bank statement in one profile. `snapshot_or_upload` allows one source per side, `snapshot` requires a camera photo, `upload` requires a saved file, and `snapshot_and_upload` requires both sources of the same document. Camera source is client reported, not proof of a trusted camera feed.

Liveness requests a server challenge, shows the front camera with positioning hints, runs the server's gestures in order through the gesture engine shared with the JavaScript SDK, takes a JPEG frame as each gesture completes, records a video without audio during the challenge when `record_video` is on, then takes the selfie and uploads everything with the challenge ID. A timeout offers a retry with a new challenge, and a rejected submission shows the shared rejection screen whose button starts again with a new challenge. The checks show that the camera saw a server chosen sequence in time; they do not prove a live person or detect deepfakes.

Face signals come from ML Kit face detection through `react-native-vision-camera-face-detector`, attached to the camera as an output (`mlKitFaceProvider`). Pass `faceProvider` to use another provider with the same `NativeFaceProvider` shape, for example in tests. The provider sends ML Kit's `headEulerAngleY` as `yaw` and `headEulerAngleX` as `pitch`, read from the unmirrored frames ML Kit analyses. The contract expects `yaw` positive when the person turns to their own left and `pitch` positive when the head tilts up.

Location shows the consent copy (naming the reference place by its label when one is configured), requests permission, takes a high accuracy fix and retries up to the spec attempts until it meets `max_accuracy_m` and `max_age_s`. Android reports `is_mock` from the platform's mock flag; iOS sends `null`. Server rejections show the shared rejection screen, and its retry takes a new fix. No geocoding or IP lookup is called. Pass `locator` to replace the native location source.

All copy, colours, type sizes and icons come from the spec constants exported by the JavaScript SDK; text is centred on every screen. The file picker supports permitted images, PDFs and DOCX files. Bundle the Ubuntu font files from `assets/fonts` into the host app's native font resources, as in the example. The SDK supplies light and dark themes.

Run `npm run validate` for the JavaScript build, TypeScript checks, lint and screen tests, and `npm run check:spec` to confirm the JavaScript SDK's generated spec matches `../sdk-spec`. See [TESTING.md](TESTING.md).

## Upload test files

Synthetic front and back PNGs are in the sibling JavaScript SDK at `test/fixtures/documents`. Android demo files are available under Downloads > Credflare-Samples. The iOS example enables local document sharing so files placed in its Documents directory appear in Files under On My iPhone. Use the Upload-Samples folder in either demo app. These are test documents, not real identity records.
