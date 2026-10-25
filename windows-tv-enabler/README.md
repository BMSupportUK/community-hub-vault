# BM TV Enabler for Windows

Free, unsigned per-user installer for Windows 10/11 x64. No paid signing, BM login, Android phone, Java or Android Studio required. Windows may display an unknown-publisher / SmartScreen warning; organisation-managed PCs may block unsigned applications. Never disable Windows security software.

## Customer setup
1. Download BM TV Enabler Setup from Install Guides → TV Remote Enabler → Windows.
2. Run the installer. If SmartScreen offers it, choose More info → Run anyway only for the download obtained directly from BM Support. Follow the installer and launch BM TV Enabler.
3. Connect the computer and Fire TV to the same home network. Avoid guest Wi-Fi and disconnect VPN. If Windows asks about network access, allow it for your trusted private home network only.
4. Install and open BM Remote Helper on the Fire TV using the Amazon guides in the same section. Leave it open; it exports the control APK required by this app.
5. Enable ADB debugging on the TV: Settings → My Fire TV → Developer options → ADB debugging → ON. Some models use Device & Software. If Developer options is hidden, open About, highlight the device name and press OK seven times, then go back.
6. Press Find my TV and explicitly select the correct named TV, or enter the TV address displayed in BM Remote Helper. No device is selected or enabled automatically. “Debugging not reachable” may mean debugging is off or the network is blocking access; it is not proof the switch is off.
7. Press Turn on remote control. On the TV, approve Allow USB debugging? and tick Always allow from this computer. You have up to a minute to approve.
8. Wait for the green confirmation. The app installs BM Remote Control if absent and enables its Accessibility service without removing other services.
9. Close this Windows app. Go back to BM Remote Helper on the TV. In your support ticket or order, enter the six-digit TV code only when staff request screen sharing, then approve the connection/screen-sharing prompt on the TV.
10. End support from the ticket/order or TV Helper when finished. The Windows app does not start a support session or let anyone view your TV by itself.

The TV's debugging switch is a manual TV-side prerequisite; this program cannot remotely turn a closed debugging switch on. Setup normally persists through restarts. If connection fails later, check the TV's current address. Factory reset or TV software changes may require setup again. Do not forward port 5555 on your router or expose debugging to the internet.

## Maintenance
Source is separate from the web app. Package with @electron/packager (win32 x64), bundling official Google platform-tools adb.exe, AdbWinApi.dll and AdbWinUsbApi.dll plus Google's NOTICE.txt. Compile installer.nsi with NSIS, supplying APPDIR and OUTPUT. Electron loads the static relative-path dist/index.html: the site's Vite config is deliberately unchanged.

Run regressions with `bun test windows-tv-enabler/tests`. Physical Windows/Fire TV testing remains necessary. ADB uses an isolated server port 5038 and keys in the app's per-user data directory. No credentials or ADB private keys are distributed in releases.