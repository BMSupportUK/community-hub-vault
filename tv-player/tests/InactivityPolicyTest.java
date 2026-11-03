package uk.bmsupport.player;

public final class InactivityPolicyTest {
    private static void check(boolean condition, String message) { if (!condition) throw new AssertionError(message); }
    public static void main(String[] args) {
        check(!InactivityPolicy.prompt(0, 10_799_999), "No prompt before three hours");
        check(InactivityPolicy.prompt(0, 10_800_000), "Prompt after three hours");
        check(!InactivityPolicy.exit(10_800_000, 10_859_999), "Viewer gets a full minute");
        check(InactivityPolicy.exit(10_800_000, 10_860_000), "Unanswered prompt exits after one minute");
        System.out.println("4 inactivity checks passed");
    }
}