# iPhone app for the App Store

## What you will get
An iPhone and iPad app called **BM Support**, built the same way as the Android app. It opens the live site inside a native app shell. When you publish in Lovable, the app updates straight away, with no new App Store version needed. It also gets:
- The BM Support icon and loading screen
- Lock-screen notifications with sound, for tickets, shifts, outages, orders and payments. On iPhone these come from Apple's notification service.
- Face ID or a passcode for the screen lock, if you want it

## What I need from you (the blockers)
1. **An Apple Developer account.** It costs £79 a year at developer.apple.com. Nobody can put an app in the App Store without one.
2. **A build machine.** Apple only lets you build iPhone apps on a Mac. I'll set up an automatic build on GitHub's Mac machines, like the Android build, so you don't need a Mac yourself. You'll need to add your Apple signing details to GitHub once. I'll give you step-by-step instructions for that.
3. **An App Store listing.** This needs screenshots, a description, a privacy policy link (your site already has one) and a support contact.

## Important risk: Apple's review
Apple checks every app before it goes live, and is much stricter than Android:
- **"Just a website" rule:** Apple often turns down apps that only show a website. Native features like notifications, Face ID and the app icon help, but they don't guarantee approval.
- **Content and payments:** Apple may question selling subscriptions for streaming or TV services, and taking card payments inside the app instead of through Apple. It may also question the adult-content option. In the worst case, Apple rejects the app outright.
- **Fallback if Apple says no:** the "Add to Home Screen" iPhone app you already have keeps working. Another option is TestFlight, Apple's testing app, which can share the app with up to 10,000 people without a full public listing.

## Steps
1. Add the iPhone project next to the Android one, using the same app ID: uk.bmsupport.app.
2. Add iPhone notifications: connect Apple's notification service to the existing push system, and add the spoken alert sounds.
3. Create the icons, loading screen and permission messages (notifications, Face ID).
4. Set up an automatic GitHub build that signs the app and uploads it to TestFlight.
5. Put an "iPhone app" button in the account menu once the app is live. Until then, the current Add to Home Screen guide stays.
6. Write a release checklist, like the Android signing guide.

## Technical details
- Capacitor iOS platform (`@capacitor/ios`), `server.url` = https://bmsupport.uk, WKWebView, and `allowNavigation` the same as on Android.
- Push notifications: `@capacitor/push-notifications` sending to APNs through Firebase Cloud Messaging (FCM), which the app already uses. This needs an APNs auth key (.p8) uploaded to Firebase, and a `GoogleService-Info.plist` file. Custom spoken sounds are bundled as .caf files and referenced in the `sound` field of the APNs payload.
- Workflow `.github/workflows/ios-build.yml` on `macos-latest`: `cap sync ios`, then fastlane match/cert import, then `xcodebuild archive`, then upload to TestFlight using an App Store Connect API key. The secrets are the API key ID, issuer ID, the .p8 key, the signing certificate (.p12) and its password, and the provisioning profile.
- Platform detection in `push-client.ts` / `use-push-register.tsx` so iOS registers native push, not web push.
- None of this can be built or signed in Lovable itself. Every build runs on GitHub.
