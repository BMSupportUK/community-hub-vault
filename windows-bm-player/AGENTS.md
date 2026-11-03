# Windows BM Player rules
- The opening film is bundled offline and rendered before the main screen; the main window is maximised before being shown to avoid a small-window flash.
- This standalone Electron shell uses an isolated React renderer and a narrow, sender-verified IPC bridge; credentials and device tokens stay encrypted in the main process, never in renderer storage.
- Website calls use only the existing device-token `/api/public/player` endpoint; provider requests are built from stored DNS/login, never arbitrary renderer URLs.
- Bundled libVLC runs in-process through the pinned Windows x64 Koffi bridge and renders to BM-owned child HWNDs; never spawn external VLC or expose provider URLs/native handles to the renderer. Validated normalised surface rectangles keep previews, playback controls and dialogs separate.
- Live TV preserves provider category/channel order, like Android; only films and series apply the remembered sort.
- Windows test packages are standalone downloads, never registered as available app builds or added to website downloads until launch is explicitly requested.
- Sports matching bundles the website's shared channel matcher rather than copying its normalization rules.