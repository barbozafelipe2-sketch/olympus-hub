# OlyHub App Store Release Gates

Status: PWA foundation exists; native App Store release is **not** complete.

This file is a release checklist, not a claim that the current web build is an iOS binary.

## Already satisfied in the product architecture

- Account creation is paired with in-app account deletion.
- Deletion is reachable from Settings and requires deliberate confirmation.
- Private account data and Storage objects are removed server-side before the Auth user is deleted.
- User data is isolated by Supabase Row Level Security.
- OlyHub has an explicit privacy/authorization boundary for Project data.
- Usage and execution state are traceable.
- PWA shell does not cache authenticated API responses.
- Email/password is currently OlyHub's own account system; there is no third-party/social login in the commercial UI today.

## Required before App Store submission

### 1. Native application identity

Still required:
- Apple Developer Program account/team selected.
- Final bundle identifier selected and registered.
- iOS target/native wrapper created.
- Signing certificates/profiles configured.
- App icons in Apple's required native sizes.
- Launch assets and supported device/orientation decisions.
- Final minimum iOS version.

Do not invent a bundle identifier before the commercial identity is chosen.

### 2. Privacy policy and App Privacy

Apple requires a Privacy Policy URL for iOS apps and App Store Connect privacy answers describing the app and third-party partners' data practices.

OlyHub still needs:
- public Privacy Policy URL
- actual commercial entity/contact identity in the policy
- data categories mapped to OlyHub/Supabase/provider behavior
- retention and deletion language matching the implemented Delete Account flow
- App Store Connect privacy questionnaire completed from actual production behavior

Official references:
- https://developer.apple.com/help/app-store-connect/reference/app-information/app-privacy
- https://developer.apple.com/help/app-store-connect/manage-app-information/manage-app-privacy/
- https://developer.apple.com/app-store/user-privacy-and-data-use/

### 3. Native privacy manifest

After the native wrapper and SDK set are frozen, add and validate `PrivacyInfo.xcprivacy`.

The manifest must reflect the native app and included SDKs rather than being guessed in the React repository before the native stack exists.

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
- production environment-variable audit
- provider/API failure observability test

## Current release verdict

### Web/PWA
Foundation is installable and substantially functional.

### Public beta
Close. The two-user RLS isolation harness exists but still needs staging credentials and an executed passing run. Production legal URLs, final quotas/business model and production observability also need closure.

### Apple App Store
Not ready yet. Native packaging/signing, privacy manifest, final legal metadata, business-model/IAP decision, store assets and native runtime testing remain mandatory release work.
