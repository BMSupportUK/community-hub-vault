package uk.bmsupport.player;

import android.graphics.Bitmap;
import android.os.Build;
import android.os.Handler;
import android.view.SurfaceView;
import android.view.View;

/**
 * A still of the playing preview, shown full screen while the box's decoder moves to the new
 * picture, so opening a previewed channel never flashes black. Lifted on the first new frame.
 */
final class PreviewSnapshot {
    static final long MAX_COVER_MS = 4000;
    static final long CAPTURE_WAIT_MS = 300;
    private static Bitmap still;

    private PreviewSnapshot() {}

    /** Copies the preview picture, then runs next (always exactly once, even if the copy fails). */
    static void capture(View surface, Handler ui, Runnable next) {
        clear();
        final boolean[] done = {false};
        final Runnable once = () -> { if (!done[0]) { done[0] = true; next.run(); } };
        if (Build.VERSION.SDK_INT < 24 || !(surface instanceof SurfaceView) || surface.getWidth() <= 0 || surface.getHeight() <= 0) { once.run(); return; }
        try {
            int w = Math.min(surface.getWidth(), 1280), h = Math.max(1, surface.getHeight() * w / surface.getWidth());
            Bitmap bm = Bitmap.createBitmap(w, h, Bitmap.Config.ARGB_8888);
            android.view.PixelCopy.request((SurfaceView) surface, bm, result -> {
                if (result == android.view.PixelCopy.SUCCESS) set(bm); else bm.recycle();
                once.run();
            }, ui);
            ui.postDelayed(once, CAPTURE_WAIT_MS);
        } catch (RuntimeException e) { once.run(); }
    }

    static synchronized void set(Bitmap b) { still = b; }
    /** The still for full screen (handed over once), or null. */
    static synchronized Bitmap take() { Bitmap b = still; still = null; return b; }
    static synchronized void clear() { still = null; }
}
