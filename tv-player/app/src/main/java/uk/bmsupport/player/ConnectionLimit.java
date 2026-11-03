package uk.bmsupport.player;

/** Three continuous minutes over the subscription limit triggers the warning/report. */
final class ConnectionLimit {
    static final long GRACE_MS = 3 * 60_000L;
    private ConnectionLimit() {}
    static boolean over(int active, int max) { return max > 0 && active > max; }
    static boolean sustained(long since, long now) { return since > 0 && now - since >= GRACE_MS; }
}