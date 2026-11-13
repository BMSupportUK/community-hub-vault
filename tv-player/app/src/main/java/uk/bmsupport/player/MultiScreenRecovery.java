package uk.bmsupport.player;

/** Bounded, pane-local recovery; buffering time is not mistaken for a stuck decoder. */
final class MultiScreenRecovery {
    static final long BLACK_MS = 10000;
    static final long FROZEN_MS = 4000;
    static final int MAX_RESTARTS = 3;
    private long lastFrames = -1, lastProgress = -1;
    private int restarts;
    private boolean exhausted;
    private final Runnable restart, failed;

    MultiScreenRecovery(Runnable restart, Runnable failed) {
        this.restart = restart;
        this.failed = failed;
    }

    void sample(long now, boolean playing, long frames) {
        if (exhausted) return;
        if (!playing) { lastProgress = -1; lastFrames = frames; return; }
        if (lastProgress < 0 || frames != lastFrames) {
            lastProgress = now;
            lastFrames = frames;
            return;
        }
        if (now - lastProgress < (frames <= 0 ? BLACK_MS : FROZEN_MS)) return;
        lastProgress = -1;
        lastFrames = -1;
        if (restarts < MAX_RESTARTS) {
            restarts++;
            restart.run();
        } else {
            exhausted = true;
            failed.run();
        }
    }
}