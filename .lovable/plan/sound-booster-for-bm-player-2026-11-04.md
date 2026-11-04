# Sound booster for BM Player

Add a "Sound booster" setting so quiet channels, films and series can be made louder than the device's normal maximum.

## What customers will see
- **Settings > Sound booster** with levels: Off, Low (+50%), Medium (+100%), High (+150%).
- A **booster button in the player controls** (while watching) to change the level without leaving the channel.
- The chosen level is remembered on that device and applies to Live TV, Movies, Series and Catch up.
- A short note on High: "Very loud — may distort on small speakers."

## Which players
- **Android (TV, Fire TV, phones):** works with the built-in player. Amazon catch-up opens in VLC, so the booster doesn't apply there; that screen will say so.
- **Windows and Mac:** works inside the app's built-in VLC picture.

## Release
- New Android, Windows and Mac versions, signed and uploaded as usual so existing installs update in place.
- Tests for the level settings and that the setting is remembered.

## Technical details
- Android: attach `android.media.audiofx.LoudnessEnhancer` to the ExoPlayer audio session ID (re-attach on session change, release on screen close); gains 0 / 600 / 1200 / 1800 mB. Stored in SharedPreferences.
- Windows/Mac: set embedded libVLC volume to 100 / 150 / 200 / 250 (libVLC allows above 100); stored in existing local settings.
- Multi-screen: booster applies to whichever pane has sound.
