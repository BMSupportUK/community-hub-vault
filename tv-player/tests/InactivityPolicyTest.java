package uk.bmsupport.player;

public final class InactivityPolicyTest {
    private static void check(boolean condition, String message) { if (!condition) throw new AssertionError(message); }
    public static void main(String[] args) {
        check(!InactivityPolicy.prompt(0, 10_799_999), "No prompt before three hours");
        check(InactivityPolicy.prompt(0, 10_800_000), "Prompt after three hours");
        check(!InactivityPolicy.exit(10_800_000, 10_859_999), "Viewer gets a full minute");
        check(InactivityPolicy.exit(10_800_000, 10_860_000), "Unanswered prompt exits after one minute");
        check(InactivityPolicy.promptAt(0) == 10_800_000L, "Standby cannot move the three-hour warning deadline");
        check(InactivityPolicy.closeAt(0) == 10_860_000L, "Standby close deadline includes only the original one-minute response");
        check(!InactivityPolicy.overdue(0, 10_859_999L), "No forced close before three hours and one minute");
        check(InactivityPolicy.overdue(0, 10_860_000L), "Close after three hours and one minute even if no warning was rendered");
        check(InactivityPolicy.overdue(0, 14_400_000L), "Wake after four hours must close rather than grant another minute");
        check(!InactivityPolicy.hideControls(0, 3_499), "Controls stay up while the viewer is still pressing keys");
        check(InactivityPolicy.hideControls(0, 3_500), "Controls go away 3.5 seconds after the last press");
        System.out.println("11 inactivity checks passed");
    }
}