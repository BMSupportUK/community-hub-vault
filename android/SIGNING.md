# Android release signing

Every release build must be signed with the same key so installed apps upgrade
in place instead of failing with a signature mismatch.

- Keystore: `android/keystore/bmsupport-release.jks` (PKCS12, RSA 4096, valid ~30 years)
- Key alias: `bmsupport`
- Store/key password: project secret `ANDROID_KEYSTORE_PASSWORD` (never hardcode it)

`android/app/build.gradle` picks the keystore up automatically when
`ANDROID_KEYSTORE_PASSWORD` is present in the environment; otherwise the release
build is left unsigned.

Build a signed release APK:

```bash
bun run build && bunx cap sync android
cd android && JAVA_HOME=<jdk21> ./gradlew assembleRelease
# output: android/app/build/outputs/apk/release/app-release.apk
```

Optional environment overrides: `ANDROID_KEYSTORE_PATH`, `ANDROID_KEY_ALIAS`,
`ANDROID_KEY_PASSWORD`.

Do NOT regenerate or delete the keystore — losing it means existing users must
uninstall before they can update again. Bump `versionCode`/`versionName` in
`android/app/build.gradle` for each release.
