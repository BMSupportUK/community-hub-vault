package uk.bmsupport.player;

public final class ConnectionLimitTest {
    private static void check(boolean condition, String message) { if (!condition) throw new AssertionError(message); }
    public static void main(String[] args) {
        check(ConnectionLimit.over(3, 2), "Three connections exceed a two-screen login");
        check(!ConnectionLimit.over(2, 2), "Using every allowed connection is fine");
        check(ConnectionLimit.sustained(1, 1 + 180_000), "Three minutes triggers the warning");
        check(!ConnectionLimit.sustained(1, 1 + 179_999), "Under three minutes does not warn");
        System.out.println("4 connection-limit checks passed");
    }
}