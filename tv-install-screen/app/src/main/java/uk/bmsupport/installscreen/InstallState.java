package uk.bmsupport.installscreen;

/** Turns the Enabler's intent extras into the words shown on the TV. Plain Java so it can be unit tested. */
final class InstallState {
    static final int INSTALLING = 0, SKIPPED = 1, COMPLETE = 2, ERROR = 3;
    final int kind, percent;
    final String badge, title, detail, count;

    private InstallState(int kind, String badge, String title, String detail, String count, int percent) {
        this.kind = kind; this.badge = badge; this.title = title; this.detail = detail; this.count = count; this.percent = percent;
    }

    static InstallState from(String state, String app, int index, int total, String apps) {
        String name = clean(app);
        String n = total > 0 ? "App " + Math.max(1, Math.min(index, total)) + " of " + total : "";
        int pct = total > 0 ? Math.max(0, Math.min(100, (Math.max(0, index - 1) * 100) / total)) : 0;
        if ("complete".equals(state)) {
            String list = apps == null ? "" : clean(apps.replace('|', '\n')).replace("\n", " • ");
            return new InstallState(COMPLETE, "\u2714", "Installation complete",
                    list.isEmpty() ? "Your apps are ready to use." : list, "Press OK to close", 100);
        }
        if ("error".equals(state)) return new InstallState(ERROR, "!", "Something went wrong",
                "Please follow the steps on your phone or PC.", "Press OK to close", -1);
        if ("skipped".equals(state)) return new InstallState(SKIPPED, "Installing your apps",
                name.isEmpty() ? "Already installed" : name + " \u2014 Already installed",
                "Please don't turn off your TV.", n, total > 0 ? Math.min(100, (Math.max(1, index) * 100) / total) : 0);
        return new InstallState(INSTALLING, "Installing your apps", name.isEmpty() ? "Getting ready…" : "Installing " + name,
                "Please don't turn off your TV.", n, pct);
    }

    static String clean(String s) {
        if (s == null) return "";
        String t = s.replaceAll("[^\\p{L}\\p{N} .,'()&+\\-\\n]", "").trim();
        return t.length() > 400 ? t.substring(0, 400) : t;
    }
}
