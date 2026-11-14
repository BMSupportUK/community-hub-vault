package uk.bmsupport.player;

/** Where a catch-up recording opens: guide times are slot times and providers pad recordings, so start a few minutes in. */
final class CatchupStart {
    private CatchupStart() {}
    static final String PREF = "catchup_offset_min";
    static final int DEFAULT_MIN = 2;
    static final int[] CHOICES = {0, 1, 2, 3, 5};
    static final int JUMP_MIN = 1;

    static int offset(android.content.SharedPreferences p) {
        int v = p.getInt(PREF, DEFAULT_MIN);
        for (int c : CHOICES) if (c == v) return v;
        return DEFAULT_MIN;
    }
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
