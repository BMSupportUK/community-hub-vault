package uk.bmsupport.player;

import android.content.Context;
import android.graphics.Canvas;
import android.graphics.Paint;
import android.view.View;

/**
 * The ⛶ "make this full screen" mark: four corner brackets drawn by hand, so it never depends on
 * the device's font carrying the glyph — plenty of TV boxes don't have it.
 */
public class FullScreenGlyphView extends View {
    private final Paint p = new Paint(Paint.ANTI_ALIAS_FLAG);
    private final float pad, arm;

    public FullScreenGlyphView(Context c, int color) {
        super(c);
        float d = c.getResources().getDisplayMetrics().density;
        p.setStyle(Paint.Style.STROKE);
        p.setStrokeWidth(Math.max(1f, 2f * d));
        p.setStrokeCap(Paint.Cap.SQUARE);
        p.setColor(color);
        pad = 4f * d;
        arm = 7f * d;
    }

    @Override protected void onDraw(Canvas canvas) {
        float l = pad, t = pad, r = getWidth() - pad, b = getHeight() - pad;
        if (r <= l || b <= t) return;
        canvas.drawLine(l, t, l + arm, t, p);
        canvas.drawLine(l, t, l, t + arm, p);
        canvas.drawLine(r, t, r - arm, t, p);
        canvas.drawLine(r, t, r, t + arm, p);
        canvas.drawLine(l, b, l + arm, b, p);
        canvas.drawLine(l, b, l, b - arm, p);
        canvas.drawLine(r, b, r - arm, b, p);
        canvas.drawLine(r, b, r, b - arm, p);
    }
}
