# Fire TV remote control: helper turns it on by itself

## How it works for the customer
1. The helper sees it's on a Fire TV and shows a short guide: Settings > My Fire TV > About, then press the name 7 times to show Developer options. Then turn on **ADB debugging**.
2. The customer presses **Turn on remote control** in the helper.
3. The Fire TV shows "Allow debugging?". The customer ticks "Always allow" and presses **Allow**.
4. The helper turns on the remote control part. Then it switches debugging back off if the TV allows it, and moves on to the 6-digit code.
5. If it fails (ADB debugging is hidden, or the customer declines), the helper says so. The screen share still works as view only.

## What changes
- **Helper v1.6**: adds the Fire TV setup screens and the debugging connection to the TV itself.
- **Staff remote box**: on Fire TV it shows "Remote control on" when it's ready. If not, it shows "Customer needs to finish Fire TV setup" instead of "not available".
- Android and Google TV setup stays the same.

## What you'll need to do
Rebuild in Android Studio with the same key, upload the new helper as 1.6, then try it on one Fire TV before telling customers.

## Limits
- This is unproven. Some newer Fire TV models limit ADB debugging.
- Vega OS Fire TVs still can't run the helper.
- Remote control may need setting up again after a Fire TV restart or update, if Amazon turns it off. The helper checks and asks again only when needed.

## Technical details
- Add a small ADB client library (e.g. `dadb`, pure Kotlin) to the `app` module. Connect to `127.0.0.1:5555` with a stored RSA key, which triggers the on-TV auth prompt.
- Run `settings put secure enabled_accessibility_services <existing>:uk.bmsupport.remote.control/.ControlService` and `settings put secure accessibility_enabled 1`. Merge with the existing value and never overwrite it.
- Detect Fire TV via `Build.MANUFACTURER == "Amazon"` / the `amazon.hardware.fire_tv` feature. Check `Settings.Global.ADB_ENABLED` to decide which guide step to show.
- `control` state reports `fireSetupNeeded` so `RemotePad` can show the right message.
- No changes to locked video code beyond that message.
