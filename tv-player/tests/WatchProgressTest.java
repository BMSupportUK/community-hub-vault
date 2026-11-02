package uk.bmsupport.player;

public final class WatchProgressTest {
    private static void check(boolean condition, String message) {
        if (!condition) throw new AssertionError(message);
    }
    public static void main(String[] args) {
        check(WatchProgress.eligible("film"), "Movies record progress");
        check(WatchProgress.eligible("episode"), "Series episodes record progress");
        check(!WatchProgress.eligible("live"), "Live streams cannot resume");
        check(WatchProgress.percent(150000, 600000) == 25, "Quarter watched is 25 percent");
        check(WatchProgress.percent(900000, 600000) == 100, "Progress caps at 100 percent");
        check(WatchProgress.percent(1000, -1) == 0, "Unknown duration has no percentage");
        check(WatchProgress.resumable(150000, 600000), "Part-watched movie offers resume");
        check(!WatchProgress.resumable(600000, 600000), "Finished episode starts again");
        check(!WatchProgress.resumable(0, 600000), "Unwatched movie starts from beginning");
        System.out.println("9 watched-progress checks passed");
    }
}