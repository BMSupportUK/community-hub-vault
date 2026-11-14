# Fire TV in-app voice search

## What you'll get
On Fire TV, **Voice search** opens a BM Player "Talk now" pop-up. BM Player listens itself, sends the clip to the website to be turned into words (the same service the Windows and Mac players already use), and runs the search inside BM Player. Alexa isn't involved.

**One limit you can't get round:** the Alexa button on the remote always belongs to Amazon. Apps can't take it over. So people start talking with the on-screen **Talk now** button (press OK). They don't use the remote's mic button.

## How it works on the box
1. **First time only:** pressing Voice search asks "Allow BM Player to record audio?". If they say no, it falls back to typed search with a short note.
2. **Talk now pop-up:** shows "Listening…" with a live sound-level bar. Recording stops by itself after a short silence or 8 seconds, or when they press OK again.
3. **"Working…"**, then the words appear and the normal results list opens, the same as typed search: Live TV categories/channels, Films, Series, or Sports Guide matching.
4. **No sound picked up:** if the level bar stays flat (the TV or remote doesn't give apps any microphone sound), it says "This TV doesn't let apps use its microphone — type your search instead". It then opens the typed box and remembers this for that box, so the pop-up isn't shown again.

## Honest risk (checked first)
Amazon doesn't document whether apps can hear the remote's or the TV's microphone. Some Fire TV TVs and Cubes have a built-in microphone, and some only pass voice to Alexa. Step 1 below is a quick test build that shows only the sound-level bar. You try it on your Fire TV built into a TV. If the bar moves, I finish the feature. If it stays flat, apps can't use the microphone on that box, and you'll know before any more time goes in. Typed search stays on Fire TV either way.

## Steps
1. Test build (5.40): Voice search on Fire TV opens the Talk now pop-up with the level bar only. This also hides the old keyboard route that sent you to Alexa. You report whether the bar moves when you speak.
2. If it moves: finish recording, send to the website, put the words into the search (5.41) and make it the public download.
3. Google TV, Android boxes and phones keep the speech service they already use. Nothing changes there.

## Technical details
- Manifest: add `android.permission.RECORD_AUDIO`, requested at runtime on first use only.
- New `VoiceRecorder.java`: `AudioRecord` at 16 kHz mono PCM16 (MIC, falling back to VOICE_RECOGNITION), RMS level callback, silence end (~1.2 s below threshold after speech), 8 s cap. Writes a WAV in memory (under the existing 1.2 MB server limit) and sends it base64 with `action: "voice", mime: "audio/wav"` to `/api/public/player`. The website handler and `src/lib/player-voice.ts` already exist and need no change.
- `VoiceEntry.available()` returns true again on Amazon. `startVoice()` on Amazon goes to the new recorder dialog, never the RecognizerIntent or keyboard dictation path. A saved per-device "no mic audio" flag routes straight to typed search.
- The result text feeds the existing `runLiveVoiceSearch` / `showSearch` / `sportsVoice` paths.
- Tests: WAV header and size, silence or flat-level detection, Amazon routing never launching a speech activity, the no-mic flag falling back to typing.
- Update the `tv-player/AGENTS.md` voice rule. Release with the BM signing key and a new `app_builds` row as usual.
- The uncommitted 5.40 "hide voice on Amazon" change is replaced by step 1.
