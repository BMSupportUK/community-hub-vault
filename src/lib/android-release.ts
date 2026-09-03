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
  versionName: "1.1.4",
  versionCode: 6,
  /** Raw CDN asset (served as application/zip) — proxied by /api/public/android-apk. */
  assetUrl: androidApkAsset.url,
  /** Always use this for downloads/QR: correct .apk filename + mime type. */
  url: "/api/public/android-apk",
  absoluteUrl: "https://bmsupport.uk/api/public/android-apk",
  notes: "Fixes the inactivity lock screen on Android phones — the unlock card now always responds to touch and typing.",
} as const;
