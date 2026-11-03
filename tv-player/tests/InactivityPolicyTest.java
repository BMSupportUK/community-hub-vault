package uk.bmsupport.player;

public final class InactivityPolicyTest {
    private static void check(boolean condition, String message) { if (!condition) throw new AssertionError(message); }
    public static void main(String[] args) {
        check(!InactivityPolicy.prompt(0, 10_799_999), "No prompt before three hours");
        check(InactivityPolicy.prompt(0, 10_800_000), "Prompt after three hours");
        check(!InactivityPolicy.exit(10_800_000, 10_859_999), "Viewer gets a full minute");
        check(InactivityPolicy.exit(10_800_000, 10_860_000), "Unanswered prompt exits after one minute");
        check(!InactivityPolicy.hideControls(0, 3_499), "Controls stay up while the viewer is still pressing keys");
        check(InactivityPolicy.hideControls(0, 3_500), "Controls go away 3.5 seconds after the last press");
        System.out.println("6 inactivity checks passed");
    }
}