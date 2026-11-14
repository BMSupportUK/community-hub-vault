package uk.bmsupport.player;

/** A held remote Back activates once; a short/cancelled press never opens playback. */
final class PreviewBackHold {
    static final long HOLD_MS = 650;
    private boolean pressed, opened;
    private long started;
    void down(long now) { if (!pressed) { pressed = true; opened = false; started = now; } }
    boolean hold(long now) {
        if (!pressed || opened || now - started < HOLD_MS) return false;
        opened = true; return true;
    }
    boolean up(boolean cancelled) {
        boolean back = pressed && !opened && !cancelled;
        pressed = false; opened = false; return back;
    }
}