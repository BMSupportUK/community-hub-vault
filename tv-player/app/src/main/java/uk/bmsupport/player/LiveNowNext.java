package uk.bmsupport.player;

/** Pure helpers for the TV-box Live TV screen: which programme is on now / next, and category stepping. */
public final class LiveNowNext {
    private LiveNowNext() {}

    /**
     * Index of the programme on now and the one after it, from start/end times sorted by start.
     * Returns {-1,-1} when nothing is listed; now = -1 when the first programme hasn't started yet
     * (then next is that first one); next = -1 when the line-up ends with the current programme.
     */
    public static int[] pick(long[] starts, long[] ends, long now) {
        int n = starts == null ? 0 : starts.length;
        if (n == 0) return new int[]{-1, -1};
        int cur = -1;
        for (int i = 0; i < n; i++) {
            long en = ends != null && i < ends.length && ends[i] > 0 ? ends[i] : (i + 1 < n ? starts[i + 1] : Long.MAX_VALUE);
            if (starts[i] <= now && now < en) { cur = i; break; }
        }
        if (cur < 0) {
            for (int i = 0; i < n; i++) if (starts[i] > now) return new int[]{-1, i};
            return new int[]{-1, -1};
        }
        return new int[]{cur, cur + 1 < n ? cur + 1 : -1};
    }

    /** ‹ / › on the category bar wraps round the list. */
    public static int step(int cur, int delta, int count) {
        if (count <= 0) return 0;
        int r = (cur + delta) % count;
        return r < 0 ? r + count : r;
    }
}
