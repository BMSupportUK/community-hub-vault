# Kick-off buffering on Sky Sports UHD

## Answer for your tester
It could be partly the same thing. Kick-off is busy on the provider's servers, so everyone hits them at once. On top of that, some channels switch from the studio feed to the match feed at kick-off. That switch is like going into an advert break: the sound format or the stream's clock can change, and the player can mistake it for a dropped connection. The advert fix is only on Android/Fire TV 4.55. If your tester watches on Windows (the test link was for Windows), they don't have it yet.

## What I'll do
1. Check the stall reports from the last week for Sky Sports UHD channels near kick-off times. This shows whether the stalls are format switches (fixable in the player) or the provider struggling under load (outside our control).
2. Bring the Android advert-break fix to Windows and Mac. A change in sound, picture or the stream's clock counts as a switch. For 10 seconds after a switch the player keeps its buffer and waits longer before reconnecting, and a short black gap doesn't count as a frozen picture.
3. Add automatic checks for these rules, then build and release new Windows and Mac versions.

## Technical details
- Read the player stall reports from the database, filtered to UHD channel names, grouped by reason and minute.
- Port the Android splice-tolerance logic into the Windows/Mac freeze and stall detection (playback-core / embedded VLC watchdog), with tests beside the existing player tests.
