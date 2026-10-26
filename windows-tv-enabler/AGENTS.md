# Windows TV Enabler rules

- Windows TV Enabler (`windows-tv-enabler/`): isolated Electron, local assets, bundled official ADB; mirrors the phone enabler's wizard step-for-step — `renderer/wizard.js` ports `SetupWizard.java`, both change together; pushes control.apk extracted from the helper download. Unsigned NSIS installer served via `/api/public/tv-enabler-windows` (app_builds row "TV Enabler%Windows").
- After reading the Helper code, never send the TV Home or close BM Remote Helper (both apps): Android only shows its screen-share Allow box while the Helper is in front.
- BM TV Enabler starts with "What do you need?": Install our apps (installs apps ticked "Install on TV during setup" in the APK section) or Screen-share support (remote setup flow). Phone and Windows change together.
