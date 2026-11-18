package uk.bmsupport.player;

/**
 * Anti-buffering rules shared by the built-in player: buffer sizes, reconnect back-off,
 * when to lower quality and when to offer an SD channel. Pure logic so it can be tested.
 */
final class StreamRecovery {
    private StreamRecovery() {}

    static final String DEFAULT_BUFFER = "smooth";
    static final String[] BUFFER_LABELS = {"Small (faster zapping)", "Medium", "Large", "Extra Large (more cushion)"};
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
    static boolean isDazn(String name) {
        String n = java.text.Normalizer.normalize(name == null ? "" : name, java.text.Normalizer.Form.NFKC);
        return n.toLowerCase(java.util.Locale.ROOT).matches(".*\\bdazn\\b.*");
    }
    static boolean isCoupang(String name) {
        String n = java.text.Normalizer.normalize(name == null ? "" : name, java.text.Normalizer.Form.NFKC);
        return n.toLowerCase(java.util.Locale.ROOT).matches(".*\\bcoupang\\b.*");
    }
    /** Channel names that are heavy before playing: UHD/4K/2160, FHD, 1080p50/60, 50/60fps. */
    static boolean isHeavyName(String name) {
        String n = java.text.Normalizer.normalize(name == null ? "" : name, java.text.Normalizer.Form.NFKC).toLowerCase(java.util.Locale.ROOT);
        return n.matches(".*(\\buhd\\b|\\b4k\\b|2160|\\bfhd\\b|1080p?\\s*(50|60)|\\b(50|60)\\s*fps\\b).*");
    }
    /** Measured heavy stream: 8 Mbps+, taller than 1080, or 1080 at 49fps+. */
    static boolean isHeavyFormat(int width, int height, float fps, int bitrate) {
        int h = Math.min(Math.max(width, 0), Math.max(height, 0)) > 0 ? Math.max(height, 0) : 0;
        return bitrate >= 8_000_000 || h > 1088 || (h >= 1080 && fps >= 49f);
    }
    /** Channels this device has measured as heavy (loaded from prefs). */
    static final java.util.Set<String> HEAVY = java.util.Collections.synchronizedSet(new java.util.LinkedHashSet<>());
    static final int HEAVY_MAX = 500;
    static String heavyKey(String name) { return name == null ? "" : java.text.Normalizer.normalize(name, java.text.Normalizer.Form.NFKC).trim().toLowerCase(java.util.Locale.ROOT); }
    static boolean isHeavy(String name) { return isHeavyName(name) || (!heavyKey(name).isEmpty() && HEAVY.contains(heavyKey(name))); }
    /** Adds a measured heavy channel; returns true when newly added. Oldest entries drop past the cap. */
    static boolean rememberHeavy(String name) {
        String k = heavyKey(name);
        if (k.isEmpty() || isHeavyName(name)) return false;
        synchronized (HEAVY) {
            if (!HEAVY.add(k)) return false;
            while (HEAVY.size() > HEAVY_MAX) { java.util.Iterator<String> it = HEAVY.iterator(); it.next(); it.remove(); }
        }
        return true;
    }
    /** Sports-pass feeds (DAZN, Coupang Play) and high-bitrate streams get the steadier large-buffer profile. */
    static boolean cushioned(String name) { return isDazn(name) || isCoupang(name) || isHeavy(name); }
    /** Diagnostic tag for the admin buffering report. */
    static String providerTag(String name) { return isDazn(name) ? "dazn" : isCoupang(name) ? "coupang" : isHeavy(name) ? "high_bitrate" : null; }
    static long liveTargetMs(String name) { return cushioned(name) ? 30000 : LIVE_TARGET_MS; }
    static long stallReconnectMs(String name) { return cushioned(name) ? 6000 : STALL_RECONNECT_MS; }
    /**
     * Stalls in two minutes before the other format is tried/shared. One stall used to flip the
     * channel ts↔m3u8 for every device, which made the feed thrash between formats.
     */
    static int formatSwapStalls(String name) { return 3; }
    static boolean drifted(long offset, String name) { return offset > (cushioned(name) ? 60000 : LIVE_DRIFT_MS); }
    /**
     * Drift measured from where the provider's playlist puts the live point (its hold-back), not
     * from the edge, so a normal provider offset never triggers a buffer-flushing jump.
     */
    static boolean drifted(long offset, long defaultOffset, String name) {
        return offset > Math.max(0, defaultOffset) + (cushioned(name) ? 60000 : LIVE_DRIFT_MS);
    }
    /**
     * HLS live keeps the provider's own hold-back. Forcing a 12–30s offset on Xtream playlists
     * (often only ~30s long) parked playback at the oldest segment, which then fell out of the
     * playlist (behind live window) and flushed the buffer — the repeating stalls.
     */
    static boolean overrideLiveOffset(String url) {
        return url == null || !url.toLowerCase(java.util.Locale.ROOT).contains(".m3u8");
    }
    /** HLS live may ease down to this speed when the buffer runs low, so the picture keeps moving instead of stalling. */
    static final float HLS_MIN_SPEED = 0.97f;
    /** Never speed up towards the edge: that empties the preloaded segments. */
    static final float HLS_MAX_SPEED = 1.0f;
    /** A slow or missing segment is retried this many times before the stream counts as failed. */
    static final int SEGMENT_RETRIES = 6;
    static float[] hlsLiveSpeeds(String url) { return overrideLiveOffset(url) ? null : new float[]{HLS_MIN_SPEED, HLS_MAX_SPEED}; }
    static int[] bufferMs(String id, String name) { return bufferMs(cushioned(name) ? "large" : id); }

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
    /** After a programme/advert switch the player keeps its buffer this long before treating a stall or still picture as a fault. */
    static final long ADVERT_GRACE_MS = 10000;
    static boolean inAdvertGrace(long sinceFormatChange) { return sinceFormatChange >= 0 && sinceFormatChange <= ADVERT_GRACE_MS; }
    /** Stuck-buffer reconnect wait: a stall that began at an advert switch gets the extra grace on top of the normal wait. */
    static long advertStallTimeout(long base, boolean advertStall) { return advertStall ? base + ADVERT_GRACE_MS : base; }

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

    private static final java.util.regex.Pattern HD_NAME = java.util.regex.Pattern.compile("\\b(hd|fhd|uhd|4k|1080p?|720p?)\\b");
    /** True for HD/FHD/UHD/4K names, where an SD sibling is worth offering. */
    static boolean isHdName(String name) {
        String l = name == null ? "" : name.toLowerCase(java.util.Locale.ROOT);
        return HD_NAME.matcher(l).find();
    }
}
