package uk.bmsupport.player;

/**
 * Anti-buffering rules shared by the built-in player: buffer sizes, reconnect back-off,
 * when to lower quality and when to offer an SD channel. Pure logic so it can be tested.
 */
final class StreamRecovery {
    private StreamRecovery() {}

    static final String DEFAULT_BUFFER = "smooth";
    static final String[] BUFFER_LABELS = {"Small (fast start)", "Normal", "Smooth (fewer stalls)", "Large"};
    static final String[] BUFFER_IDS = {"small", "normal", "smooth", "large"};
    static final int MAX_TRIES = 8;
    /** A stall this long is treated as a dropped stream and reconnected. */
    static final long STALL_RECONNECT_MS = 12000;
    /** Stalls shorter than this are normal start-up and not recorded. */
    static final long MIN_REPORT_MS = 1000;
    static final long STALL_WINDOW_MS = 120000;
    static final int STALLS_TO_LOWER = 2;
    static final int STALLS_TO_OFFER_SD = 3;
    static final long STABLE_RAISE_MS = 120000;
    /** Live plays this far behind the edge, a safety cushion for short cut-outs. */
    static final long LIVE_TARGET_MS = 12000;

    /** {minBuffer, maxBuffer, startPlayback, afterRebuffer} in milliseconds. */
    static int[] bufferMs(String id) {
        switch (id == null ? DEFAULT_BUFFER : id) {
            case "small": return new int[]{10000, 15000, 1500, 3000};
            case "normal": return new int[]{15000, 30000, 2000, 4000};
            case "large": return new int[]{40000, 90000, 3000, 6000};
            default: return new int[]{30000, 60000, 2500, 6000};
        }
    }

    /** Buffer memory cap: a quarter of the app's memory, between 32 MB and 128 MB. */
    static int bufferBytes(long maxHeap) {
        long q = maxHeap / 4;
        return (int) Math.max(32L << 20, Math.min(128L << 20, q));
    }

    /** Picture unchanged this many 1-second checks while playing = frozen. */
    static final int FREEZE_TICKS = 4;
    /** Live this far behind "now" jumps back to the live point. */
    static final long LIVE_DRIFT_MS = 30000;

    static boolean frozen(int frozenTicks) { return frozenTicks >= FREEZE_TICKS; }
    static boolean drifted(long liveOffsetMs) { return liveOffsetMs > LIVE_DRIFT_MS; }

    /** Puts the remembered working format (ts or hls) first; other addresses keep their order. */
    /** Sky channels start on HLS: it copes with the provider's advert switches far better than MPEG-TS. */
    static String startFormat(String pref, String name) {
        if (pref != null) return pref;
        return name != null && name.toLowerCase(java.util.Locale.ROOT).matches(".*\\bsky\\b.*") ? "m3u8" : null;
    }

    /** An advert switch: the picture size/format changed moments before the stall. */
    static final long ADVERT_WINDOW_MS = 4000, ADVERT_JUMP_MS = 800;
    static boolean advertSwitch(long sinceFormatChange) { return sinceFormatChange >= 0 && sinceFormatChange <= ADVERT_WINDOW_MS; }

    static String[] preferFormat(String[] urls, String pref) {
        if (pref == null || urls == null || urls.length < 2) return urls;
        String ext = "." + pref;
        java.util.List<String> first = new java.util.ArrayList<>(), rest = new java.util.ArrayList<>();
        for (String u : urls) (u.toLowerCase(java.util.Locale.ROOT).endsWith(ext) ? first : rest).add(u);
        first.addAll(rest);
        return first.toArray(new String[0]);
    }

    /** After repeated stalls on one format, try the other one next time. */
    static String otherFormat(String url) {
        String l = url == null ? "" : url.toLowerCase(java.util.Locale.ROOT);
        return l.endsWith(".m3u8") ? "ts" : l.endsWith(".ts") ? "m3u8" : null;
    }

    /** Wait before reconnect attempt n (1-based): 1s, 2s, 4s, 8s, then 10s. */
    static long backoffMs(int attempt) {
        if (attempt <= 1) return 1000;
        return Math.min(10000, 1000L << Math.min(attempt - 1, 4));
    }

    static boolean giveUp(int attempt) { return attempt > MAX_TRIES; }

    /** Counts stall times inside the sliding window ending at now. */
    static int recentStalls(long[] stallTimes, int count, long now) {
        int n = 0;
        for (int i = 0; i < count; i++) if (now - stallTimes[i] <= STALL_WINDOW_MS) n++;
        return n;
    }

    /** Lower the bitrate cap to 60% of what's playing (never below 300 kbps). */
    static int lowerCap(int currentBitrate) {
        if (currentBitrate <= 0) return 1500000;
        return Math.max(300000, (int) (currentBitrate * 0.6));
    }

    /** True for HD/FHD/UHD/4K names, where an SD sibling is worth offering. */
    static boolean isHdName(String name) {
        String l = name == null ? "" : name.toLowerCase(java.util.Locale.ROOT);
        return l.matches(".*\\b(hd|fhd|uhd|4k|1080p?|720p?)\\b.*");
    }
}
