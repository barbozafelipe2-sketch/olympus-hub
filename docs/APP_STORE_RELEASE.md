# OlyHub App Store Release Gates

Status: Native React Native/Expo target is implemented; App Store release is **not** complete.

This file is a release checklist. The repository now includes a real React Native iOS app at `mobile/`; the web/PWA remains a separate client using the same commercial backend.

## Already satisfied in the product architecture

- Account creation is paired with in-app account deletion.
- Deletion is reachable from Settings and requires deliberate confirmation.
- Private account data and Storage objects are removed server-side before the Auth user is deleted.
- User data is isolated by Supabase Row Level Security.
- OlyHub has an explicit privacy/authorization boundary for Project data.
- Usage and execution state are traceable.
- PWA shell does not cache authenticated API responses.
- PWA includes 180px Apple touch icon and 192/512px PNG web install icons; these do not replace the native App Store icon asset catalog.
- Expo prebuild generates the native 1024x1024 App Store icon asset from the OlyHub brand image.
- Email/password is currently OlyHub's own account system; there is no third-party/social login in the commercial UI today.

## Required before App Store submission

### 1. Native application identity

Implemented in `mobile/`:
- Expo SDK 57 / React Native 0.86 app, native screens, Expo Router navigation and EAS build profiles.
- Native sign-in/account creation, persistent Supabase session, Home chat with Zeus and Olympus modes, durable Projects, task/memory/file/artifact surfaces, Settings and account deletion.
- Shared commercial Supabase project and authenticated server API; no provider credentials are shipped in the client.

Still required:
- Apple Developer Program account/team selected.
- Final bundle identifier selected and registered.
- Signing certificates/profiles configured.
- Launch assets and supported device/orientation decisions.
- Final minimum iOS version.
- Confirm App Store icon appearance from the generated 1024x1024 native asset on current iPhone/iPad device masks.

`com.olyhub.app` in `mobile/app.json` is provisional and must be verified/registered before signing.

Do not invent a bundle identifier before the commercial identity is chosen.

### 2. Privacy policy and App Privacy

Apple requires a Privacy Policy URL for iOS apps and App Store Connect privacy answers describing the app and third-party partners' data practices.

OlyHub still needs:
- public Privacy Policy URL
- actual commercial entity/contact identity in the policy
- retention and deletion language matching the implemented Delete Account flow
- App Store Connect privacy questionnaire completed from actual production behavior
- confirmation that privacy choices and AI-provider disclosures match all production vendors

Native progress:
- A source-based data map is maintained in `docs/PRIVACY_DATA_MAP.md`.
- Native first-use AI consent names the supported providers and request context; users may decline and can revoke in Settings. Consent is versioned and stored per account on-device.
- Privacy Policy and Terms links are wired into native authentication, AI consent and Settings, but their production URLs are not configured yet.

Official references:
- https://developer.apple.com/help/app-store-connect/reference/app-information/app-privacy
- https://developer.apple.com/help/app-store-connect/manage-app-information/manage-app-privacy/
- https://developer.apple.com/app-store/user-privacy-and-data-use/

### 3. Native privacy manifest

Implemented in `mobile/app.json`: Expo generates `ios/OlyHub/PrivacyInfo.xcprivacy` with no tracking and declares account identity, user content, optional photos/videos/audio, research search history, and usage data for app functionality. It is included in the CI-generated native project.

Before submission:
- Compare these declarations with production data flows and the final Privacy Policy / App Store privacy answers.
- Review every native dependency's manifest and generate the final Xcode privacy report from a signed archive.
- Update the declaration if the provider, analytics, billing, or support integrations change.

Official references:
- https://developer.apple.com/documentation/bundleresources/privacy-manifest-files
- https://developer.apple.com/documentation/bundleresources/adding-a-privacy-manifest-to-your-app-or-third-party-sdk

### 4. Login services

Current OlyHub uses its own email/password account setup. Under current App Review Guideline 4.8, an equivalent privacy-preserving login service is not required when an app exclusively uses its company's own account setup/sign-in system.

If OlyHub later adds Google, Facebook, X, LinkedIn, Amazon, WeChat or another third-party/social login for the primary account, re-evaluate Guideline 4.8 and implement an equivalent compliant login option.

Official reference:
- https://developer.apple.com/app-store/review/guidelines/#login-services

### 5. Account deletion

Apple requires apps that support account creation to support account deletion within the app.

Implemented:
- Settings -> Delete account
- deliberate confirmation phrase
- server-side private Storage cleanup
- Auth user deletion

Before submission, test this end-to-end in the native build with a real production-like account.

Official references:
- https://developer.apple.com/support/offering-account-deletion-in-your-app
- https://developer.apple.com/app-store/review/guidelines/

If Sign in with Apple is added later, deletion must also handle the required Apple token revocation flow.

### 6. Business model and purchases

OlyHub pricing is intentionally not invented in code.

Before submission decide:
- free
- freemium
- paid
- subscription tiers

If the iOS app sells eligible digital features/services through App Store commerce, implement the required StoreKit / In-App Purchase path for the chosen model and region, configure products/subscription groups in App Store Connect, and provide restore/manage subscription UX where applicable.

Official references:
- https://developer.apple.com/app-store/subscriptions/
- https://developer.apple.com/help/app-store-connect/configure-in-app-purchase-settings/overview-for-configuring-in-app-purchases
- https://developer.apple.com/help/app-store-connect/manage-submissions-to-app-review/submit-an-in-app-purchase

### 7. Terms and customer support

Still required:
- final Terms of Use URL
- public support URL/contact
- production company/developer identity
- subscription Terms/Privacy links if subscription is chosen

Do not ship placeholder legal identity.

### 8. Review access

Because OlyHub requires authentication for meaningful account/workspace features, prepare a stable App Review demo account and review notes describing any required setup.

Official reference:
- https://developer.apple.com/app-store/review/

### 9. App Store metadata

Still required:
- final app name/subtitle/description/keywords
- category and age rating
- screenshots for required device classes
- support URL
- privacy URL
- review notes
- promotional/marketing assets if desired

App Store Connect currently limits app name and subtitle to 30 characters.

Reference:
- https://developer.apple.com/help/app-store-connect/reference/app-information/app-information

### 10. Runtime release validation

Required before submission:
- run the existing two-user account-isolation E2E harness against staging
- signup/signin/signout/delete-account E2E
- Home persistence E2E
- Project persistence E2E
- private file upload/read/delete E2E
- artifact create/revise/download E2E
- Zeus fallback behavior test
- Olympus partial-provider-failure test
- quota 429 test
- no-provider 503 test
- native offline/reconnect behavior test
- iPhone/iPad layout, keyboard, document picker, sharing and account-deletion QA on a signed development build
- production environment-variable audit
- provider/API failure observability test

## Current release verdict

### Web/PWA
Foundation is installable and substantially functional.

### Public beta
Close. The two-user RLS isolation harness exists but still needs staging credentials and an executed passing run. Production legal URLs, final quotas/business model and production observability also need closure.

### Apple App Store
Native code and EAS build profiles exist, but no signed iOS binary has been built or device-tested yet. The app is **not ready to submit** until the Apple team/bundle ID, privacy manifest, production legal metadata, business-model/IAP decision, store assets, EAS secrets, native E2E and signed device QA are complete.
