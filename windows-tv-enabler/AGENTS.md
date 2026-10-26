# Windows TV Enabler rules

- Windows TV Enabler (`windows-tv-enabler/`): isolated Electron, local assets, bundled official ADB; mirrors the phone enabler's wizard step-for-step — `renderer/wizard.js` ports `SetupWizard.java`, both change together; pushes control.apk extracted from the helper download. Unsigned NSIS installer served via `/api/public/tv-enabler-windows` (app_builds row "TV Enabler%Windows").
- After reading the Helper code, never send the TV Home or close BM Remote Helper (both apps): Android only shows its screen-share Allow box while the Helper is in front.
- BM TV Enabler opens on its welcome/PIN screen, then resumes a saved unexpired confirmation at DONE without TV commands; otherwise starts with "What do you need?". Persist the original confirmation expiry, renewal capability and selected TV locally; explicit Reset clears them. Phone and Windows change together.
- Both Enabler apps require a 24-hour PIN login (from the customer's ticket/order Remote setup tab) before Get started; `/api/public/enabler-login` swaps the PIN for a device token. Phone and Windows change together.
- A customer-requested renewal uses a per-confirmation secret capability, claimed once; never restart Helper during active/claimed sharing. Only for renewal of a non-active connection, cold-start Helper and keep it foregrounded for fresh consent.
