# SDK verification flow

The application backend creates a verification using a compliance profile, then exchanges its request ID for a short-lived applicant session. The app receives only that session. The backend retains its client credentials and the verification request ID.

The SDK loads the outstanding requirements, explains the requested evidence and consent, collects one step at a time, uploads evidence and submits its file IDs. After each submission it reloads the requirements so the backend decides which steps remain. Grouped alternatives must remain choices; the SDK must not ask for every alternative.

Document capture includes the requested sides, preview, retake and explicit confirmation. Gallery uploads appear only when the requirement permits them. A camera photo does not prove a trusted camera feed, liveness or deepfake resistance.

A finished collection flow reports `submitted`. The application's backend obtains the verification decision from the API or webhook. Closing the collection UI reports `cancelled`; it must not reject the verification case.

## Lifecycle requirements

- Prevent overlapping camera launches and submissions, including rapid repeated taps.
- Distinguish permission denial, cancellation, an unavailable session, validation failure and network failure.
- Keep retry keys and uploaded file IDs while retrying the same evidence. Replacing an image starts a new operation.
- Let the authenticated host backend renew a session for the same case. The SDK cannot renew its own authority or change workspace/environment.
- Restore the current step after ordinary backgrounding. Process termination needs an explicit recovery policy for temporary images and session renewal.
- Confirm cancellation before discarding selected evidence. Revoking a session preserves the verification case.
- Keep evidence, tokens and personal fields out of diagnostic logs and analytics events.
- Provide accessible labels, clear progress, localized copy and host branding.
- Refuse unsupported capture policies and checks with an actionable explanation.

## Liveness and location steps

After documents, the SDK runs `facial_verification` and `location_verification` in the order the profile lists them, refreshing the requirements after each submission. A receipt appears only when nothing the SDK can collect remains; when the profile also needs host steps (forms or other checks) the receipt says the app will guide the applicant through them.

- Liveness: request a new server challenge each time the step starts, gate on face position (`spec/liveness.json` position rules), run the server's gestures in order with the shared engine and per gesture timeout, capture a frame when each gesture completes, record a video without audio over the challenge window when `record_video` is on, take the selfie, upload every file with the challenge ID, then submit. A timeout, an expired challenge or a rejected challenge offers a retry with a new challenge. Show the recording consent line before starting.
- Documents list: show one line naming the in app steps that follow (`documents.selfie_next`, `documents.location_next`, `documents.selfie_location_next` or `documents.location_selfie_next`, in profile order). Use `documents.host_steps_next` only when the remaining steps are host only, and `receipt.host_steps` on the receipt only in that case.
- Location: show the consent copy (a single reference place is named in the title with no separate requirement line; several places get one requirement line following the any or all match; labels only, never coordinates), request permission, take a high accuracy fix and retry up to `retry_attempts` until it meets `max_accuracy_m` and `max_age_s`, show the fix for confirmation, then submit. Show server rejections with their reason and a retry; for a place requirement rejection show `location.place.not_matched_within` or `location.place.not_matched_outside` with the label.
- All applicant copy, tokens and icons come from the generated spec. Text is centred on every screen.

## Release boundary

The development packages provide a session client and guided document, liveness and location collection. Applicants start without entering session credentials, choose a requested document, add each required side and source, review their evidence, follow the liveness prompts, share their location and receive a collection receipt. The developer selects the profile on their server; the recipient follows the outstanding requirements without a profile picker.

Before a production release, add form steps, typed lifecycle results, guided session renewal UI, Android process recovery, permission recovery, accessibility and physical device capture tests. The liveness challenge shows that the camera saw a server chosen sequence in time. It does not prove a live person, and deepfake detection is not available.
