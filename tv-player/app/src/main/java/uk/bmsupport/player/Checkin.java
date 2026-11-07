package uk.bmsupport.player;

/** Spreads website check-ins so many boxes never hit BM Support in the same second, and backs off when it is busy. */
final class Checkin {
    static final long CAP_MS = 300_000;
    private static int failures;
    private static long until;
    private static int slow = 1;

    static long jitter(long ms, double r) { return Math.round(ms * (0.8 + 0.4 * r)); }
    static long backoff(int fails, long base, double r) {
        return jitter(Math.min(Math.max(CAP_MS, base), base << Math.min(fails, 10)), r);
    }
    static synchronized void ok() { failures = 0; until = 0; }
    static synchronized void fail(long retryAfterMs) {
        failures++;
        if (retryAfterMs > 0) until = System.currentTimeMillis() + Math.min(retryAfterMs, 600_000);
    }
    static synchronized void setSlow(int n) { slow = Math.max(1, Math.min(10, n)); }
    static synchronized long delay(long base, double r) {
        long b = base * slow;
        long wait = failures > 0 ? backoff(failures, b, r) : jitter(b, r);
        return Math.max(wait, until - System.currentTimeMillis());
    }
    static long delay(long base) { return delay(base, Math.random()); }
    static synchronized void reset() { failures = 0; until = 0; slow = 1; }
    static long retryAfterMs(String v) {
        if (v == null) return 0;
        try { return Math.max(0, Long.parseLong(v.trim()) * 1000); } catch (NumberFormatException e) { return 0; }
    }
}
