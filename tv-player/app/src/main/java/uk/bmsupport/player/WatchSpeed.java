package uk.bmsupport.player;

/** Average download speed (kbps) of this app between two check-ins, for the website's connection-strength bars. */
final class WatchSpeed {
    private static long lastBytes = -1, lastAt;
    private WatchSpeed() {}
    static synchronized int sample(long bytes, long nowMs) {
        long pb = lastBytes, pa = lastAt;
        lastBytes = bytes; lastAt = nowMs;
        return rate(pb, pa, bytes, nowMs);
    }
    static int rate(long prevBytes, long prevAt, long bytes, long nowMs) {
        long ms = nowMs - prevAt;
        if (prevBytes < 0 || bytes < prevBytes || ms < 5000 || ms > 600000) return 0;
        return (int) Math.min(2_000_000L, (bytes - prevBytes) * 8L / ms);
    }
}
