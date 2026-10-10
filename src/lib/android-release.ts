import androidApkAsset from "@/assets/BMSupport.apk.asset.json";

/**
 * Single source of truth for the BM Support Android release.
 *
 * Keep these in step with `android/app/build.gradle` every time a new APK is
 * uploaded. `versionCode` MUST increase, and the APK must be signed with the
 * permanent release keystore (see `android/SIGNING.md`) — that combination is
 * what lets Android upgrade the app in place instead of asking members to
 * uninstall first.
 *
 * Changing `ANDROID_RELEASE.versionName` is also what triggers the one-time
 * "new version available" notification for every member.
 */
export const ANDROID_RELEASE = {
  versionName: "1.2.0",
  versionCode: 12,
  /** Raw CDN asset (served as application/zip) — proxied by /api/public/android-apk. */
  assetUrl: androidApkAsset.url,
  /** Always use this for downloads/QR: correct .apk filename + mime type. */
  url: "/api/public/android-apk",
  absoluteUrl: "https://bmsupport.uk/api/public/android-apk",
  /** QR target: a landing page with one tap-to-download button, so camera
   *  apps / link previews opening the URL can't start duplicate downloads. */
  qrUrl: "https://bmsupport.uk/get-android-app",
  notes: "New inbox message alerts now ding on your phone even when the app is closed, and the alert sound setting is created by the app itself so it can't go missing.",
} as const;
