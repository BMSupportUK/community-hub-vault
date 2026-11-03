# Windows BM Player rules
- The opening film is bundled offline and rendered before the main screen; the main window is maximised before being shown to avoid a small-window flash.
- This standalone Electron shell uses an isolated React renderer and a narrow, sender-verified IPC bridge; credentials and device tokens stay encrypted in the main process, never in renderer storage.
- Website calls use only the existing device-token `/api/public/player` endpoint; provider requests are built from stored DNS/login, never arbitrary renderer URLs.
- Official Windows VLC is bundled and controlled through authenticated loopback HTTP; playback arguments are fixed and spawned without a shell, progress stays local per login/item.
- Windows test packages are standalone downloads, never registered as available app builds or added to website downloads until launch is explicitly requested.
- Sports matching bundles the website's shared channel matcher rather than copying its normalization rules.