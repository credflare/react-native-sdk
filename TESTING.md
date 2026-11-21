# Development test coverage

Date: 2026-11-21. Host: macOS 26.3, Apple Silicon. React Native 0.88.1, React 19.3.0, Node 26.0.0, JDK 17.

| Check | Command | Result |
| --- | --- | --- |
| JavaScript SDK build, TypeScript check, lint and screen tests | `npm run validate` | 8 passed |
| Generated spec and fixtures match `../sdk-spec` | `npm run check:spec` | Passed |
| Android native build with NDK 28.2 | `./gradlew assembleDebug` in `example/android` | Passed |

The screen tests render the guided flow against an API double that answers with the contract fixtures from `sdk-spec`:

- Liveness: a replay face provider feeds the spec traces for the gestures in the server challenge. The test checks that recording starts with the first gesture, a frame is saved per gesture in order, the video and selfie are uploaded with the challenge ID, and the facial submission carries the file IDs and engine results. Further tests check that a timeout offers a retry that requests a new challenge, and that a used challenge rejected by code restarts with a new challenge.
- Location: a replaced locator returns a weak fix three times, then a good one. The test checks the reference place copy, the low accuracy retry, an accuracy rejection and a place rejection matched by code, a new request key per attempt and the submitted contract fields, then the receipt.
- Documents list: the line naming the following in app steps.
- Native position mapping to `provider` and `is_mock` on Android and iOS.

Android emulator run (Desk_Pixel_9_API_35, Android 15) against the local API:

- ML Kit signs, on a portrait turned to the subject's own right and looking down: yaw -26.8 and pitch -3.9; on its mirror image yaw +28.1 and pitch -3.3. This matches the contract (yaw positive toward the person's own left, pitch positive when tilting up), so ML Kit angles are passed through unchanged.
- Liveness with the emulator's virtual camera: camera permission, preview and recording indicator work, and ML Kit reports about ten samples a second with no face, so the flow shows the positioning hint and then the timeout retry.
- With face samples replayed from the spec traces over the real camera, the server challenge completed with real gesture frames, video and selfie, and the facial submission was accepted.
- Location with an emulator fix at the reference place: permission, a 5 m fix and a submission the server matched to the place, then the receipt.
- A mock location from a test provider is refused on the device before sending.

Outstanding coverage: no iOS build or physical device run. Liveness checks show that the camera saw a server chosen sequence in time; they do not prove a live person or detect deepfakes.
