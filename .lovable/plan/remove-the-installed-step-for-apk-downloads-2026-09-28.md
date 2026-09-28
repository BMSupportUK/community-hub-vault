# Remove the "Installed" step for APK downloads

## Why

Apps like the QD app are third-party APKs. They never talk back to the site, so the "Installed" step can never be filled in and always looks stuck. Only our own BM Support Android app could report an install.

## What I'll change

1. **Download-only progress** — in the download popup, the steps become just "Link issued" and "Downloaded" (with the live percentage and device while downloading). The "Installed" step is removed.
2. **Keep useful download info** — download count, device name and download time stay visible.
3. **Staff view** — the staff live-transfers list drops the install column/label the same way, so it shows download status only.
4. **BM Support app only** — if a card is our own website Android app, the "Installed & opened" step stays, because that app does report back when a member signs in.

## Technical details

- `TransferStatusSteps` in `src/components/app/AppTransferPanel.tsx`: render the install step only when the transfer already has `installedAt` (i.e. the own app reported), otherwise show two steps.
- Same conditional in the staff transfers view that reads `installedAt`.
- No database or server changes; `reportNativeInstall` stays for the own app.
