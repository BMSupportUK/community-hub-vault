# Fix: APK install information not showing

## Why it happens

The "Installed & opened" step on a download link is only filled in when the installed app itself opens, signs in, and reports back to the site. When a member downloads the APK through the secure link (or types the code into Downloader on a Fire Stick) and installs it manually, nothing on that device tells the website — so the install step stays blank forever. A website cannot detect an APK being installed on another device; only the app can report it.

## What I'll change

1. **Manual "Mark as installed" button** — in the download popup, once the download has completed, show a "Mark as installed" button. Tapping it stamps the link as installed (recorded as "confirmed by member" rather than a device report), so the status steps complete instead of looking stuck.

2. **Clearer status wording** — when the download finished but no install report has arrived, the steps will say the install info appears automatically once the app is opened and signed in, with the manual button as the fallback. No more silent blank step.

3. **Keep automatic reporting** — the official app will still stamp installs automatically when it's opened and signed in on the device; the manual button only appears as a fallback.

## Technical details

- New server function `markTransferInstalled` in `src/lib/app-transfer.functions.ts`: authenticated, member can only stamp their own transfer, sets `installed_at` and records `install_device` as "Confirmed by member" so manual marks are distinguishable from real app reports.
- `TransferStatusSteps` in `src/components/app/AppTransferPanel.tsx`: updated labels/hint text and the new button, shown only when downloaded but not yet installed.
- No database changes needed — existing `app_transfers` columns are reused.
