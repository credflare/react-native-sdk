# Development test coverage

Date: 2026-11-20. Host: macOS 26.3, Apple Silicon. React Native 0.88.1, React 19.3.0, Node 26.0.0, Xcode 26.6, JDK 17.

| Check | Result |
| --- | --- |
| TypeScript check | Passed |
| Automatic session handoff, guided camera step and theme contrast | 2 passed |
| iOS JavaScript release bundle | Passed |
| iOS simulator native build | Passed |
| iOS launch on iPhone 17 Pro, iOS 26.5 | Passed |
| Android native build with NDK 28.2 | Passed |
| Android launch on Desk_Pixel_9_API_35 | Passed |

The iOS example uses one React version across the app, renderer and SDK. Native camera, document file selection and random-value modules are linked into the example app. The demo requests its session automatically when Start is pressed.

Outstanding coverage: native camera and gallery selection, permission denial/restoration, background and process recovery, real-device upload interruptions, full requirement navigation, and end-to-end submission from a device to the API. No physical device is connected. Liveness, trusted-camera and deepfake detection are unavailable and have not been tested.
