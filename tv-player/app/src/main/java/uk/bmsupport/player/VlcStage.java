package uk.bmsupport.player;

import android.app.Activity;
import android.view.View;
import android.view.ViewGroup;
import android.widget.FrameLayout;

/** The video stays on the guide's window for preview and translucent full screen. */
final class VlcStage implements AutoCloseable {
    final ViewGroup decor;
    final View anchor;
    final View picture;
    boolean full;
    private final View.OnLayoutChangeListener follow = (v,l,t,r,b,ol,ot,or,ob) -> place();

    VlcStage(Activity activity, View anchor, View picture) {
        this.decor = (ViewGroup) activity.getWindow().getDecorView();
        this.anchor = anchor; this.picture = picture;
        decor.addView(picture, new FrameLayout.LayoutParams(1, 1));
        anchor.addOnLayoutChangeListener(follow);
        decor.addOnLayoutChangeListener(follow);
        place();
    }

    void full(boolean value) { full = value; place(); }

    private void place() {
        int[] a = new int[2], d = new int[2];
        anchor.getLocationInWindow(a); decor.getLocationInWindow(d);
        FrameLayout.LayoutParams lp = new FrameLayout.LayoutParams(
                full ? decor.getWidth() : Math.max(1, anchor.getWidth()),
                full ? decor.getHeight() : Math.max(1, anchor.getHeight()));
        lp.leftMargin = full ? 0 : a[0] - d[0];
        lp.topMargin = full ? 0 : a[1] - d[1];
        picture.setLayoutParams(lp);
    }

    @Override public void close() {
        anchor.removeOnLayoutChangeListener(follow); decor.removeOnLayoutChangeListener(follow);
        decor.removeView(picture);
    }
}