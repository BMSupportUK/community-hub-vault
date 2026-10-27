package uk.bmsupport.tvenabler;

public final class SetupWizardTest {
    private static void check(boolean result, String rule) { if (!result) throw new AssertionError(rule); }
    public static void main(String[] args) {
        SetupWizard w = new SetupWizard();
        w.connected("1234"); check(w.step == SetupWizard.Step.DEBUGGING, "Debugging needs explicit confirmation");
        w.confirmDebugging(); check(w.step == SetupWizard.Step.CHECK, "Connect is step two");
        check(w.enterCode("1234") == SetupWizard.CodeResult.IGNORED, "No code before connecting");
        w.connected("1234"); check(w.step == SetupWizard.Step.TV_CODE, "Connecting shows the TV code step");
        check(w.enterCode("9999") == SetupWizard.CodeResult.WRONG && w.step == SetupWizard.Step.TV_CODE, "Wrong code does not move on");
        check(w.enterCode("1234") == SetupWizard.CodeResult.OK && w.step == SetupWizard.Step.SETUP, "Correct code starts automatic setup");
        w.setupFinished(false); check(w.step == SetupWizard.Step.SETUP && !w.ready, "Failed TV check cannot finish");
        w.setupFinished(true); check(w.step == SetupWizard.Step.DONE && w.ready, "Checked TV finishes setup");
        w.reset(); w.confirmDebugging(); w.connected("0001");
        w.enterCode("1"); w.enterCode("2");
        check(w.enterCode("3") == SetupWizard.CodeResult.RESET && w.step == SetupWizard.Step.CHECK && w.tvCode == null, "Three wrong codes go back to connect");
        w.reset(); check(w.step == SetupWizard.Step.DEBUGGING && !w.ready && w.tvCode == null, "Reset clears the wizard");
        check(SetupWizard.newCode(new java.security.SecureRandom()).matches("\\d{4}"), "TV code is 4 digits");
        check(SetupWizard.ready(true, true, true, true), "All actual checks make TV ready");
        check(!SetupWizard.ready(true, true, true, false), "Missing permission is not ready");
        check(SetupWizard.validHost("192.168.0.10") && !SetupWizard.validHost("192.168.0.300"), "Host validation");
        w.reset();
        long expiry = 1000L + 24L * 60 * 60 * 1000;
        check(!SetupWizard.canIssueConfirmation(true, expiry, false, expiry - 1), "Unused reference blocks new code until 24h expiry");
        check(SetupWizard.canIssueConfirmation(true, expiry, true, expiry - 1), "Ticket/order use enables new code before expiry");
        check(SetupWizard.canIssueConfirmation(true, expiry, false, expiry), "24h expiry enables new code");
        check(SetupWizard.canIssueConfirmation(false, 0, false, 1000), "First code can be issued");
        check(SetupWizard.referenceExpired(403, "expired"), "Screen-share end expires the reference before 24 hours");
        check(SetupWizard.referenceExpired(200, "expired"), "Successful expired-state response also clears the reference");
        check(!SetupWizard.referenceExpired(500, "expired") && !SetupWizard.referenceExpired(403, "error"), "Connectivity/server failures must keep the saved reference");
        check(SetupWizard.canIssueConfirmation(false, 0, false, expiry - 1), "Cleared ended-share reference permits a fresh code immediately");
        check(w.resumeConfirmation("K7P4QX", expiry, expiry - 1) && w.step == SetupWizard.Step.DONE, "Reopen restores confirmation until original 24-hour expiry");
        w.reset();
        check(!w.resumeConfirmation("K7P4QX", expiry, expiry) && w.step == SetupWizard.Step.DEBUGGING, "Expired confirmation cannot resume setup");
        check(SetupWizard.installFinished(SetupWizard.Step.DONE, "new"), "Finished install offers return to the start, not reset");
        check(!SetupWizard.installFinished(SetupWizard.Step.DONE, "have"), "Screen-share finish still offers reset");
        check(!SetupWizard.installFinished(SetupWizard.Step.SETUP, "new"), "Still installing is not a finished run");
        check(!SetupWizard.installFinished(SetupWizard.Step.DONE, null), "No choice made is not a finished install");
        System.out.println("SetupWizardTest passed");
    }
}
