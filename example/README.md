# Credflare React Native example

Check out `javascript-sdk` and `react-native-sdk` beside each other. Build the JavaScript SDK and install dependencies from the React Native SDK root.

Start the JavaScript SDK demo backend on port 3107, then run `npm start` here. In another terminal, run `npm run android` or `npm run ios`. Android requires the configured Android SDK and JDK; iOS requires Xcode and CocoaPods.

Forward ports 3107, 8018 and 8081 with `adb reverse` when using the local demo API on Android. Press Start in the app to create an applicant session. Client credentials stay on the demo backend.

Synthetic uploads are in the sibling JavaScript SDK under `test/fixtures/documents`.
