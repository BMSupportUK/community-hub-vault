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
  versionName: "1.1.2",
  versionCode: 4,
  url: androidApkAsset.url,
  absoluteUrl: `https://bmsupport.uk${androidApkAsset.url}`,
  notes: "Fixes the secure connection error when sending an app to a Fire Stick or Android box over Wi-Fi.",
} as const;
