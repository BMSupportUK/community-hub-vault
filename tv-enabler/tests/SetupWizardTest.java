package uk.bmsupport.tvenabler;

public final class SetupWizardTest {
    private static void check(boolean result, String rule) { if (!result) throw new AssertionError(rule); }
    public static void main(String[] args) {
        SetupWizard w = new SetupWizard();
        w.next(); check(w.step == SetupWizard.Step.DEBUGGING, "Debugging needs explicit confirmation");
        w.confirmDebugging(); check(w.step == SetupWizard.Step.CHECK, "Check existing setup is step two");
        w.next(); check(w.step == SetupWizard.Step.CHECK, "Cannot skip actual TV check");
        w.checked(true); w.next();
        check(w.step == SetupWizard.Step.REPORT, "Ready TV skips device choice, installs and activation");
        w.reset(); w.confirmDebugging(); w.checked(false); w.next(); w.chooseDevice();
        check(w.step == SetupWizard.Step.HELPER, "Incomplete TV starts helper install");
        w.next(); check(w.step == SetupWizard.Step.HELPER, "Incomplete operation cannot advance");
        w.operationCompleted(); w.next(); check(w.step == SetupWizard.Step.CONTROL, "Helper confirmation advances to control");
        w.operationCompleted(); w.next(); check(w.step == SetupWizard.Step.ACTIVATE, "Control confirmation advances to activation");
        w.operationCompleted(); w.next(); check(w.step == SetupWizard.Step.REPORT, "Activation confirmation advances to reporting");
        w.operationCompleted(); w.next(); check(w.step == SetupWizard.Step.DONE, "Reporting confirmation finishes wizard");
        w.reset(); check(w.step == SetupWizard.Step.DEBUGGING && !w.ready && !w.completed, "Reset clears all wizard confirmations");
        check(SetupWizard.ready(true, true, true, true), "All actual checks make TV ready");
        for (int missing = 0; missing < 4; missing++) {
            boolean[] c = {true, true, true, true}; c[missing] = false;
            check(!SetupWizard.ready(c[0], c[1], c[2], c[3]), "Every actual check is required: " + missing);
        }
        check(SetupWizard.validHost("192.168.0.110") && SetupWizard.validHost("192.168.0.121"), "Android and Amazon addresses accepted");
        check(!SetupWizard.validHost("999.168.0.1") && !SetupWizard.validHost("192.168.0"), "Invalid addresses rejected");
        System.out.println("Setup wizard: all progression, readiness and reset rules pass");
    }
}