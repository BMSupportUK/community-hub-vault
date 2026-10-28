package uk.bmsupport.remote;

import android.content.Context;

/** Fire TV remote-control setup: runs the self-ADB enable with progress, a stuck watchdog and diagnostics. */
public final class FireSetup {
    public static final FireSetup INSTANCE = new FireSetup();

    public interface OnChange {
        void onChange();
    }

    private static volatile boolean busy;
    private static volatile String message;
    private static volatile String progress;
    private static volatile OnChange onChange;
    private static int run;

    private FireSetup() {}

    public boolean getBusy() {
        return busy;
    }

    public String getMessage() {
        return message;
    }

    public String getProgress() {
        return progress;
    }

    public void setOnChange(OnChange listener) {
        onChange = listener;
    }

    private void changed() {
        OnChange l = onChange;
        if (l != null) l.onChange();
    }

    public void start(Context ctx, final Runnable done) {
        if (busy) {
            changed();
            return;
        }
        run++;
        final int myRun = run;
        busy = true;
        message = null;
        progress = "Starting…";
        changed();
        final Context app = ctx.getApplicationContext();
        Diag.INSTANCE.send("fire_setup_start", "adb=" + Control.INSTANCE.adbEnabled(app)
                + " installed=" + (!Control.INSTANCE.needsInstall(app))
                + " running=" + Control.INSTANCE.running(app)
                + " listed=" + Control.INSTANCE.listed(app));

        // Watchdog: if nothing finishes within 2.5 minutes, report where it got stuck.
        new Thread(() -> {
            try {
                Thread.sleep(150000L);
            } catch (InterruptedException ignore) {
            }
            if (busy && run == myRun) {
                run++;
                String at = progress == null ? "starting" : progress;
                message = "Setup got stuck at: " + at + ". Press Turn on remote control to try again.";
                Diag.INSTANCE.send("fire_setup_stuck", progress);
                Control.INSTANCE.setLastError(app, message);
                busy = false;
                progress = null;
                changed();
            }
        }).start();

        new Thread(() -> {
            String error = null;
            try {
                Control.INSTANCE.enableViaAdb(app, p -> {
                    if (run == myRun) {
                        progress = p;
                        Diag.INSTANCE.send("fire_setup_step", p);
                        changed();
                    }
                });
            } catch (Throwable t) {
                if (t instanceof Control.FireSetupError) {
                    error = t.getMessage();
                } else {
                    String detail = t.getMessage() == null ? "no details" : t.getMessage();
                    error = "That didn't work (" + t.getClass().getSimpleName() + ": " + detail
                            + "). Check ADB debugging is on and press Allow, or press Skip.";
                }
            }
            if (run != myRun) return;
            message = error;
            Diag.INSTANCE.send(error == null ? "fire_setup_ok" : "fire_setup_error", error);
            Control.INSTANCE.setLastError(app, error);
            busy = false;
            progress = null;
            changed();
            if (done != null) done.run();
        }).start();
    }

    /** During a help session, repair a Fire TV whose control app dropped out. */
    public void repairIfNeeded(Context ctx, Runnable done) {
        Control c = Control.INSTANCE;
        if (c.isFireTv(ctx) && (c.needsInstall(ctx) || !c.enabled(ctx)) && c.adbEnabled(ctx) && c.adbAuthorised(ctx)) {
            start(ctx, done);
        }
    }
}
