package uk.bmsupport.tvenabler;

/** UI-independent progression: confirmations never substitute for real TV checks. */
final class SetupWizard {
    enum Step { DEBUGGING, CHECK, DEVICE, HELPER, CONTROL, ACTIVATE, REPORT, DONE }
    Step step = Step.DEBUGGING;
    boolean ready, completed;

    void confirmDebugging() { if (step == Step.DEBUGGING) step = Step.CHECK; }
    void checked(boolean isReady) { if (step != Step.CHECK) return; ready = isReady; completed = true; }
    void chooseDevice() { if (step == Step.DEVICE) { step = ready ? Step.REPORT : Step.HELPER; completed = false; } }
    void operationCompleted() { completed = true; }
    void confirmTv(boolean isReady) {
        if (step != Step.REPORT) return;
        ready = isReady;
        completed = isReady;
    }
    void next() {
        if (!completed) return;
        switch (step) {
            case CHECK: step = ready ? Step.REPORT : Step.DEVICE; break;
            case HELPER: step = Step.CONTROL; break;
            case CONTROL: step = Step.ACTIVATE; break;
            case ACTIVATE: step = Step.REPORT; break;
            case REPORT: step = Step.DONE; break;
            default: return;
        }
        completed = false;
    }
    void reset() { step = Step.DEBUGGING; ready = false; completed = false; }
    static boolean ready(boolean adb, boolean helper, boolean control, boolean accessibility) {
        return adb && helper && control && accessibility;
    }
    static boolean validHost(String host) {
        if (!host.matches("^\\d{1,3}(\\.\\d{1,3}){3}$")) return false;
        for (String part : host.split("\\.")) if (Integer.parseInt(part) > 255) return false;
        return true;
    }
}