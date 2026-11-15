package uk.bmsupport.player;

import java.util.concurrent.Executors;
import java.util.concurrent.ScheduledExecutorService;
import java.util.concurrent.ScheduledFuture;
import java.util.concurrent.TimeUnit;

/** The video/UI thread must not be able to delay an unanswered warning forever. */
final class InactivityWatchdog {
    private final ScheduledExecutorService worker = Executors.newSingleThreadScheduledExecutor(r -> {
        Thread t = new Thread(r, "inactivity-exit");
        t.setDaemon(true);
        return t;
    });
    private ScheduledFuture<?> graceful, forced;

    synchronized void arm(long remainingMs, Runnable requestExit, Runnable forceExit) {
        if (graceful != null) return;
        // Queue both now: even a blocked graceful shutdown cannot prevent the hard stop.
        graceful = worker.schedule(requestExit, Math.max(0, remainingMs), TimeUnit.MILLISECONDS);
        forced = worker.schedule(forceExit, Math.max(0, remainingMs) + 1500, TimeUnit.MILLISECONDS);
    }

    synchronized void cancel() {
        if (graceful != null) graceful.cancel(false);
        if (forced != null) forced.cancel(false);
        graceful = null;
        forced = null;
    }
}