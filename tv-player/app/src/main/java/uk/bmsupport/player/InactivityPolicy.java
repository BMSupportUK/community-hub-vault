package uk.bmsupport.player;

final class InactivityPolicy {
    static final long IDLE_MS = 3 * 60 * 60_000L;
    static final long RESPONSE_MS = 60_000L;
    static boolean prompt(long lastInput, long now) { return now - lastInput >= IDLE_MS; }
    static boolean exit(long promptedAt, long now) { return now - promptedAt >= RESPONSE_MS; }
}