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

## Release boundary

The development packages provide a session client and a native document capture component. The example apps collect one outstanding document at a time. They are not yet a complete guided verification experience.

Before a production release, add the full requirement navigator, form and selfie steps, host-provided location capture, typed lifecycle results, guided session-renewal UI, Android process recovery, permission recovery, accessibility and physical-device capture tests. Liveness, trusted-camera and deepfake checks require real processing engines and independent validation before being advertised as available.
