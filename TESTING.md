# Development test coverage

Date: 2026-11-22. Host: macOS 26.3, Apple Silicon. React Native 0.88.1, React 19.3.0, Node 26.0.0, JDK 17.

| Check | Command | Result |
| --- | --- | --- |
| JavaScript SDK build, TypeScript check, lint and screen tests | `npm run validate` | 96 passed |
| Generated spec and fixtures match `../sdk-spec` | `npm run check:spec` | Passed |
| Android native build with NDK 28.2 | `./gradlew assembleDebug` in `example/android` | Passed |
| iOS simulator build with Xcode 26.6 | `pod install`, then `xcodebuild` for the iOS Simulator with `CODE_SIGNING_ALLOWED=NO` in `example/ios` | Passed |

The screen tests render the guided flow against an API double that answers with the contract fixtures from `sdk-spec`:

- Liveness: a replay face provider feeds the spec traces for the gestures in the server challenge. The test checks that recording starts with the first gesture, a frame is saved per gesture in order, the video and selfie are uploaded with the challenge ID, and the facial submission carries the file IDs and engine results. Further tests check that a timeout offers a retry that requests a new challenge, that a used challenge rejected by code restarts with a new challenge, that a rejection leaving the challenge valid shows the server reason, and that a send which never reached the server keeps the uploads and retries with the same request key.
- Location: a replaced locator returns a weak fix three times, then a good one. The test checks the reference place copy, the low accuracy retry, an accuracy rejection and a place rejection matched by code, a new request key per attempt and the submitted contract fields, then the receipt. Further tests check that a mock fix is refused on the device without a request, and that a send which never reached the server retries with the same request key.
- Rejection screens: liveness and location rejections show the title, message, requester and help line from the spec map, and their button starts the step again or takes a new fix.
- Questions: the questionnaire fixture is answered through the screen. Hidden questions appear and disappear as `show_if` answers change, are not checked while hidden and are not sent; required, consent, number range, date and email checks show the spec copy; a refused answer without a code shows the server message with a retry.
- Refresh rule: after the answers are sent the session comes back with a phone requirement the workflow added, so the phone step shows instead of the receipt; a failed reload shows the refresh error with a retry and never the receipt.
- Email and phone codes: the number is sent without spaces, brackets, dots or dashes, the code screen shows the masked destination and the resend countdown, a wrong code clears the field, and the confirmation leads to the receipt. Each of the 14 email and phone rejection fixtures shows its spec copy and does its action (close, wait for the countdown from `resend_available_at`, send a new code, or enter the code again). The help line links to the requester's help email.
- `show_if`: all 62 server computed cases in `show-if-cases.json` are replayed through the exported evaluator.
- Documents list: the line naming the following in app steps.
- Native position mapping to `provider` and `is_mock` on Android and iOS.

Android emulator run (Desk_Pixel_9_API_35, Android 15) against the local API:

- ML Kit signs, on a portrait turned to the subject's own right and looking down: yaw -26.8 and pitch -3.9; on its mirror image yaw +28.1 and pitch -3.3. This matches the contract (yaw positive toward the person's own left, pitch positive when tilting up), so ML Kit angles are passed through unchanged.
- Liveness with the emulator's virtual camera: camera permission, preview and recording indicator work, and ML Kit reports about ten samples a second with no face, so the flow shows the positioning hint and then the timeout retry.
- With face samples replayed from the spec traces over the real camera, the server challenge completed with real gesture frames, video and selfie, and the facial submission was accepted.
- Location with an emulator fix at the reference place: permission, a 5 m fix and a submission the server matched to the place, then the receipt.
- A mock location from a test provider is refused on the device before sending.

Android emulator run (Desk_Pixel_9_API_35, Android 15) on 2026-11-22 against the local API in the sandbox, with a profile whose workflow adds a phone requirement when the country answer is Germany:

- Questionnaire: the employer and income questions appear only for Employed and disappear again for Student; an impossible date and a missing consent show the spec messages; the country is picked from the searchable list (Hermes has no region display names, so the SDK uses its own English names).
- After the answers were sent, the session returned the phone requirement the workflow added and the phone step showed instead of the receipt.
- Phone code: a number typed with spaces reached the server in international format; the code from the SMS log driver was accepted after a wrong code showed the `phone.code_invalid` screen and cleared the field; the receipt listed the answers and the phone number.
- Asking for a second code at once showed the `phone.resend_too_soon` screen with a countdown, and the button sent a new code when it ended.

Outstanding coverage: no iOS physical device run. Liveness checks show that the camera saw a server chosen sequence in time; they do not prove a live person or detect deepfakes.
