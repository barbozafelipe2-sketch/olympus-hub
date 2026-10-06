# OlyHub iOS / React Native

This is the native OlyHub application built with Expo SDK 57 and React Native 0.86. It is a real native target; it does not embed the web app in a WebView. The web/PWA and iOS app use the same commercial Supabase project and authenticated API.

## Native capabilities in this vertical slice

- Native email sign-in and account creation with persistent Supabase sessions.
- Home conversations persisted in the shared commercial database.
- Zeus and Olympus modes through the existing server API. Provider selection stays in server-side routing, with OpenAI as the required fallback.
- Projects with a dedicated durable conversation, tasks, approved memory, private file upload, and artifact listing/sharing.
- Settings with sign-out and the existing server-side account deletion flow.
- Native navigation, keyboard handling, document picker, share sheet, secure per-user data boundaries through RLS.

## Configure local development

1. Copy `.env.example` to `.env` and set the public Supabase URL, publishable key, HTTPS API origin, public Privacy Policy URL and Terms of Use URL.
2. Run `npm ci` from `mobile/`.
3. Run `npm run start` from `mobile/`, then open the project in Expo Go or a development build.
4. Run `npm run typecheck`, `npm run doctor` and `npx expo export --platform ios --output-dir dist/ios` before changes are considered verified.

The API origin must serve `/api/chat` and `/api/account` from the commercial OlyHub deployment. Provider credentials and the Supabase secret key must remain on the server.

## EAS / App Store setup

- `com.olyhub.app` is a provisional bundle identifier and must be confirmed as available and registered to the correct Apple Developer team before signing.
- Link the project using `npx eas-cli@latest init` after signing in to the OlyHub Expo account.
- Configure all five `EXPO_PUBLIC_*` variables in EAS Development, Preview and Production environments.
- Create an iOS development build with `npx eas-cli@latest build --platform ios --profile development`.
- After native QA and all release gates pass, produce a store build with `npx eas-cli@latest build --platform ios --profile production` and submit through App Store Connect.

An EAS build is not the same as App Store approval. Review `../docs/APP_STORE_RELEASE.md` for the legal, privacy, billing, identity, metadata and runtime checks that still gate submission.
