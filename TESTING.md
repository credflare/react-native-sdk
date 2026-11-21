# Development test coverage

Date: 2026-11-21. Host: macOS 26.3, Apple Silicon. React Native 0.88.1, React 19.3.0, Node 26.0.0, JDK 17.

| Check | Command | Result |
| --- | --- | --- |
| JavaScript SDK build, TypeScript check, lint and screen tests | `npm run validate` | 7 passed |
| Generated spec and fixtures match `../sdk-spec` | `npm run check:spec` | Passed |
| Android native build with NDK 28.2 | `./gradlew assembleDebug` in `example/android` | Passed |

The screen tests render the guided flow against an API double that answers with the contract fixtures from `sdk-spec`:

- Liveness: a replay face provider feeds the spec traces for the gestures in the server challenge. The test checks that recording starts with the first gesture, a frame is saved per gesture in order, the video and selfie are uploaded with the challenge ID, and the facial submission carries the file IDs and engine results. A second test checks that a timeout offers a retry that requests a new challenge.
- Location: a replaced locator returns a weak fix three times, then a good one. The test checks the reference place copy, the low accuracy retry, an accuracy rejection, a place rejection naming the place, a new request key per attempt and the submitted contract fields, then the receipt.
- Documents list: the line naming the following in app steps.
- Native position mapping to `provider` and `is_mock` on Android and iOS.

Outstanding coverage: the run on the Android emulator (camera preview, ML Kit face signals, video recording, runtime permissions and location) has not been done in this round, so ML Kit yaw and pitch signs are not yet confirmed on a device. No iOS build or physical device run was done. Liveness checks show that the camera saw a server chosen sequence in time; they do not prove a live person or detect deepfakes.
