/** Keeps server addresses, ports and logins out of anything shown on screen. */
const PLAYBACK="This channel isn't working right now. Try again, pick another channel, or use Report a problem.";
const LEAK=/([a-z][a-z0-9+.-]*:\/\/|\b\d{1,3}(\.\d{1,3}){3}\b|\[[0-9a-f:]+\]|\b[a-z0-9-]+(\.[a-z0-9-]+)+:\d{2,5}\b|\/(live|movie|series|timeshift)\/[^/\s]+\/[^/\s]+)/i;
function forScreen(message,fallback=PLAYBACK){let s=String(message??'').replace(/^Error invoking remote method '[^']*': (Error: )?/,'').trim();return !s||LEAK.test(s)?fallback:s;}
module.exports={PLAYBACK,forScreen,leaks:s=>LEAK.test(String(s??''))};
