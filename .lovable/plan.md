# Spoken welcome on the linked-device screen

## What you'll get
When the family picture changes to "Your device is linked", a friendly female UK (British) voice says:

> "Welcome to BM Player, {username}. Your device is linked — enjoy watching."

- Plays on Android, Fire TV, Windows and Mac.
- Uses the customer's website username (the name on their BM Support account), not their provider login.
- Plays once per full app start — never when reopening from the background, and never on screens before sign-in.
- If the voice can't load (slow internet), the screen works exactly as now, silently. The "Go to home screen" button is never delayed by it.
- Pressing the button stops the voice straight away.

## How it works
1. The website makes the spoken clip using Lovable AI's text-to-speech with a British female voice, only for a linked, verified device. The clip is saved per username so it isn't remade every start (cheaper, faster).
2. The player asks for the clip when the link is confirmed and plays it over the family picture.
3. Release Android/Fire TV, Windows and Mac builds, and publish the website.

## Technical details
- New `welcome_voice` action in `src/routes/api/public/player.ts` (device-token auth, linked device only, rate-limited). Username from `profiles.username` for `device.user_id`; fallback greeting without a name.
- Server helper calls `/v1/audio/speech` with the default TTS model and a British female voice, returns MP3; cached in private storage keyed by a hash of the username (+ text version).
- Android `MainActivity.java`: fetch on link-confirmed, play via MediaPlayer, stop on button/exit; respects existing `pinPassed` background rule.
- Windows/Mac `renderer/app.jsx` linked screen: main-process IPC fetch, play via `<audio>`; stop on continue.
- Small `bun test` for the "once per full start, linked only" rule.
