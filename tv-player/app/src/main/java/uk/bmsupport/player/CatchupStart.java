package uk.bmsupport.player;

/** Where a catch-up recording opens: guide times are slot times and providers pad recordings, so start a few minutes in. */
final class CatchupStart {
    private CatchupStart() {}
    static final String PREF = "catchup_offset_min";
    static final int DEFAULT_MIN = 2;
    static final int[] CHOICES = {0, 1, 2, 3, 5};
    static final int JUMP_MIN = 1;
    /** Each press of "Skip ahead to the programme" moves this far forward from where playback has got to. */
    static final int SKIP_MIN = 2;
    /** Longest learned late start a channel can keep (minutes after the listed start). */
    static final int MAX_LEARNED_MIN = 20;

    static int offset(android.content.SharedPreferences p) {
        int v = p.getInt(PREF, DEFAULT_MIN);
        for (int c : CHOICES) if (c == v) return v;
        return DEFAULT_MIN;
    }
    /** Per-channel memory of how late its catch-up programmes really begin, learned from the skip button. */
    static String learnKey(String channelId) { return "catchup_late_" + channelId; }
    /** Opening offset for a channel: what the customer skipped to last time on it, otherwise the Settings offset. */
    static int offsetFor(android.content.SharedPreferences p, String channelId) {
        int learned = channelId == null ? -1 : p.getInt(learnKey(channelId), -1);
        return learned >= 0 ? Math.min(learned, MAX_LEARNED_MIN) : offset(p);
    }
    /** Minutes after the listed start that a skip landed on, kept to [0, MAX_LEARNED_MIN]. */
    static int learned(long landed, long listed) {
        return (int) Math.max(0, Math.min(MAX_LEARNED_MIN, (landed - listed) / 60));
    }
    /** Skip ahead from the point reached; always forward so repeated presses never return to the same spot. */
    static long skipAhead(long reached, long listed, long end) { return jump(reached, SKIP_MIN, listed, end); }
    /** Opening time (seconds) for a programme listed at [listed, end]; never past a minute before the end. */
    static long at(long listed, long end, int offsetMin) {
        long s = listed + Math.max(0, offsetMin) * 60L;
        return end > listed ? Math.max(listed, Math.min(s, end - 60)) : s;
    }
    /** Recording end extended by the same offset so the end of the show is never cut off. */
    static long end(long end, int offsetMin) { return end + Math.max(0, offsetMin) * 60L; }
    /** Minute-precise restart point after a skip of deltaMin from the reached time, kept inside [listed, end - 60]. */
    static long jump(long reached, int deltaMin, long listed, long end) {
        long t = reached - Math.floorMod(reached, 60L) + deltaMin * 60L;
        return Math.max(listed, Math.min(t, end - 60));
    }
}
