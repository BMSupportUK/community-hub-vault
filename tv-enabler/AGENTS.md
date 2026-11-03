# tv-enabler rules
- TV Enabler discovery identifies Fire TVs from local DIAL/UPnP manufacturer/model metadata independently of ADB reachability, holds a multicast lock during scanning, and requires explicit selection; TCP-only reachability never authenticates or enables a TV, so devices with closed debugging remain discoverable without side effects.

- BM TV Enabler (`tv-enabler/`) is PIN-gated and signed with the permanent BM key. Install Guides' QR opens `/api/public/tv-enabler-apk`, selecting the latest available non-Windows build, with one Download button (`?download=1` streams APK); never show an APK card. Over ADB SYNC, install Helper from `/api/public/remote-helper-apk`, then push its `assets/control.apk` directly from the phone to `/data/local/tmp`; never read the Helper's Android/data export (Fire OS blocks it) or use Downloader. Enable steps mirror `TvRemoteSetupPlugin`.
- Phone TV ADB clients (`tv-enabler` and BM Support's `tvremote`) stay identical: resend keys on later AUTH and keep pending Allow connections open so AOSP prompts survive.

- Enabler palette/control helpers own appearance; progress reads wizard state, versions use BuildConfig.
- TV installation skips use exact AndroidManifest package identities cached per APK and a read-only inventory of the selected TV; uploads/replacements refresh identity so app labels never drive skip decisions.
- TV Enabler confirms a fresh TV check before finishing; website linking optional, stages sync by expiring code; reset keeps RSA authorization. Helper opens once per run; Remote setup has Restart setup.
- Enabler references bind to one ticket/order, expire on close (share also on session end), unlink on Restart; apps clear server-expired share codes, never on network errors, keeping install/PIN state. Issuance requires the app protocol marker.
- Renewal is customer-requested and capability-bound to one confirmation; foreground Enabler claims each task once, cold-starts only non-active Helper, then atomically replaces scoped pending-session pointers without extending expiry or approving consent.
