# Windows BM Player rules
- The opening film is bundled offline and rendered before the main screen; the main window is maximised before being shown to avoid a small-window flash.
- This standalone Electron shell uses an isolated React renderer and a narrow, sender-verified IPC bridge; credentials and device tokens stay encrypted in the main process, never in renderer storage.
- Website calls use only the existing device-token `/api/public/player` endpoint; provider requests are built from stored DNS/login, never arbitrary renderer URLs.
- Bundled libVLC runs in-process through the pinned Windows x64 Koffi bridge and renders to BM-owned child HWNDs; never spawn external VLC or expose provider URLs/native handles to the renderer. Validated normalised surface rectangles keep previews, playback controls and dialogs separate.
- Live TV preserves provider category/channel order, like Android; only films and series apply the remembered sort.
- Approved Windows releases are packaged with @electron/packager and the NSIS script as per-user installers; upload the executable before registering its separate Windows app-build identity, and serve it through the logged Windows download endpoint, never the Android updater.
- Sports matching bundles the website's shared channel matcher rather than copying its normalization rules.
- Every fresh process gates playback and private actions through a main-process, website-verified account-number unlock; never persist the number or successful unlock, and wrong-number responses must retain the device link so retries work.