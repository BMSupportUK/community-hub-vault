package uk.bmsupport.player;

/** Live rating of the link between this box and the playing channel's own server: ping, stalls, reconnects and whether data arrives as fast as the channel needs. */
final class ChannelLink {
    static final long WINDOW_MS = 120_000;
    private final java.util.ArrayDeque<Long> stalls = new java.util.ArrayDeque<>(), reconnects = new java.util.ArrayDeque<>();
    private int ping = -1;
    private long lastRead = -1, lastDemux = -1, lastAt;
    private double ratio = -1;
    private int kbps = -1;
    /** A delivery shortfall only lowers the rating once it has lasted this long; buffer fill/drain makes short readings jump about. */
    static final long SUSTAIN_MS = 60_000;
    private long fairSince = -1, poorSince = -1;

    void ping(int ms) { if (ms > 0) ping = ping < 0 ? ms : (ping * 2 + ms) / 3; }
    void stalled(long now) { stalls.add(now); }
    void reconnected(long now) { reconnects.add(now); }
    /** readBytes = arrived from the server, demuxBytes = consumed by playback; ratio below 1 means the server link is falling behind. */
    void bytes(long readBytes, long demuxBytes, long now) {
        if (lastRead >= 0 && now - lastAt >= 5000) {
            long in = readBytes - lastRead, need = demuxBytes - lastDemux;
            if (in >= 0) { int k = (int) (in * 8 / (now - lastAt)); kbps = kbps < 0 ? k : (kbps + k) / 2; }
            if (in >= 0 && need > 0) { double r = (double) in / need; ratio = ratio < 0 ? r : ratio * 0.6 + r * 0.4;
                fairSince = ratio < 0.98 ? (fairSince < 0 ? now : fairSince) : -1;
                poorSince = ratio < 0.9 ? (poorSince < 0 ? now : poorSince) : -1; }
            lastRead = readBytes; lastDemux = demuxBytes; lastAt = now;
        } else if (lastRead < 0) { lastRead = readBytes; lastDemux = demuxBytes; lastAt = now; }
    }
    void reset() { lastRead = -1; ratio = -1; kbps = -1; fairSince = -1; poorSince = -1; }
    long shortMs(long now) { return fairSince < 0 ? 0 : now - fairSince; }
    long poorMs(long now) { return poorSince < 0 ? 0 : now - poorSince; }
    private static int recent(java.util.ArrayDeque<Long> q, long now) {
        while (!q.isEmpty() && now - q.peekFirst() > WINDOW_MS) q.pollFirst();
        return q.size();
    }
    String rating(long now) {
        int s = recent(stalls, now), r = recent(reconnects, now);
        if (ping < 0 && ratio < 0 && s == 0 && r == 0) return "Checking";
        if (r > 0 || s >= 3 || ping > 400 || poorMs(now) >= SUSTAIN_MS) return "Poor";
        if (s >= 1 || ping > 200 || shortMs(now) >= SUSTAIN_MS) return "Fair";
        if (ping > 80) return "Good";
        return "Excellent";
    }
    String label(long now) {
        String r = rating(now);
        return "Channel connection: " + r + (ping > 0 ? " · Ping " + ping + " ms" : "")
                + (kbps > 0 ? String.format(java.util.Locale.UK, " · %.1f Mbps", kbps / 1000.0) : "");
    }
    int pingMs() { return ping; }
    int kbps() { return kbps; }
    int stalls(long now) { return recent(stalls, now); }
    int reconnects(long now) { return recent(reconnects, now); }
    double deliveryRatio() { return ratio; }
}
