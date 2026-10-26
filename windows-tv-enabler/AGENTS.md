# Windows TV Enabler rules

- Windows TV Enabler (`windows-tv-enabler/`): isolated Electron, local assets, bundled official ADB; mirrors the phone enabler's wizard step-for-step — `renderer/wizard.js` ports `SetupWizard.java`, both change together; pushes control.apk extracted from the helper download. Unsigned NSIS installer served via `/api/public/tv-enabler-windows` (app_builds row "TV Enabler%Windows").
