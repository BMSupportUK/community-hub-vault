package uk.bmsupport.tvenabler;

import java.security.SecureRandom;

/** UI-independent progression. The code shown on the TV proves the customer picked their own TV;
 *  after that, setup runs automatically and only a real TV check can finish it. */
final class SetupWizard {
    enum Step { DEBUGGING, CHECK, TV_CODE, SETUP, DONE }
    enum CodeResult { OK, WRONG, RESET, IGNORED }
    static final int MAX_TRIES = 3;
    Step step = Step.DEBUGGING;
    boolean ready;
    String tvCode;
    int tries;

    void confirmDebugging() { if (step == Step.DEBUGGING) step = Step.CHECK; }
    /** Connected and the code was put on the TV screen. */
    void connected(String code) { if (step != Step.CHECK) return; tvCode = code; tries = 0; step = Step.TV_CODE; }
    CodeResult enterCode(String typed) {
        if (step != Step.TV_CODE || tvCode == null) return CodeResult.IGNORED;
        if (tvCode.equals(typed == null ? "" : typed.trim())) { step = Step.SETUP; tvCode = null; return CodeResult.OK; }
        if (++tries >= MAX_TRIES) { step = Step.CHECK; tvCode = null; tries = 0; return CodeResult.RESET; }
        return CodeResult.WRONG;
    }
    /** Wireless debugging pairing code from the TV already proves it's the right TV. */
    void paired() { if (step == Step.CHECK) { tvCode = null; tries = 0; step = Step.SETUP; } }
    void setupFinished(boolean isReady) { if (step != Step.SETUP) return; ready = isReady; if (isReady) step = Step.DONE; }
    void reset() { step = Step.DEBUGGING; ready = false; tvCode = null; tries = 0; }
    boolean resumeConfirmation(String code, long expiresAt, long now) {
        if (code == null || !code.matches("[A-Z0-9]{6}") || expiresAt <= now) return false;
        step = Step.DONE; ready = true; tvCode = null; tries = 0;
        return true;
    }
    static String newCode(SecureRandom r) { return String.format(java.util.Locale.ROOT, "%04d", r.nextInt(10000)); }
    static boolean ready(boolean adb, boolean helper, boolean control, boolean accessibility) {
        return adb && helper && control && accessibility;
    }
    static boolean validHost(String host) {
        if (!host.matches("^\\d{1,3}(\\.\\d{1,3}){3}$")) return false;
        for (String part : host.split("\\.")) if (Integer.parseInt(part) > 255) return false;
        return true;
    }
}
