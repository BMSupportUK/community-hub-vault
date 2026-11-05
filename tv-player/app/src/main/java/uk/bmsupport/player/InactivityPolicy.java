package uk.bmsupport.player;

final class InactivityPolicy {
    static final long IDLE_MS = 3 * 60 * 60_000L;
    static final long RESPONSE_MS = 120_000L;
    /** On-screen playback controls must not sit on the picture: they go away this long after the last press. */
    static final long CONTROLS_MS = 3500L;
    static boolean prompt(long lastInput, long now) { return now - lastInput >= IDLE_MS; }
    static boolean exit(long promptedAt, long now) { return now - promptedAt >= RESPONSE_MS; }
    static boolean hideControls(long lastPress, long now) { return now - lastPress >= CONTROLS_MS; }
}