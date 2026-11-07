// Live feed status pill (Windows/Mac): maps a playback session's engine status to the
// on-screen label. Hidden (null) while the feed is healthy so the picture stays clean.
// Engine states: 2 buffering, 3 playing, 5 ended, 7 error.
function feedStatus(session, s) {
  if (!session || !s || session.item?.kind !== 'live') return null;
  const now = Date.now();
  if (!session.backup && s.state === 3 && now - session.since > 10000 && !(Number(s.w) > 0)) return 'black';
  if (s.state === 2 && session.ready) return 'buffering';
  return null;
}

const LABELS = { black: 'No picture', buffering: 'Buffering…' };

module.exports = { feedStatus, LABELS };
