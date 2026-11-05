package uk.bmsupport.player;

import android.graphics.Bitmap;

/** Finds black bars baked into a film/episode picture (top and bottom) so the player can zoom past them. */
final class LetterboxCrop {
    private LetterboxCrop() {}
    static final int DARK = 28;

    private static boolean darkRow(int[] px, int w, int y) {
        long sum = 0; int max = 0;
        for (int x = 0; x < w; x++) { int c = px[y * w + x]; int l = (((c >> 16) & 255) * 3 + ((c >> 8) & 255) * 6 + (c & 255)) / 10; sum += l; if (l > max) max = l; }
        return sum / w < DARK && max < DARK * 3;
    }

    /** Share of the frame height that holds picture (1 = no bars). Bars must be roughly equal top and bottom. */
    static float contentShare(int[] px, int w, int h) {
        int top = 0; while (top < h / 2 && darkRow(px, w, top)) top++;
        int bottom = 0; while (bottom < h / 2 && darkRow(px, w, h - 1 - bottom)) bottom++;
        if (top >= h / 2 || bottom >= h / 2) return 1f; // dark scene, not bars
        if (Math.abs(top - bottom) > Math.max(2, h / 30)) return 1f;
        float share = (h - top - bottom) / (float) h;
        return share > 0.94f ? 1f : Math.max(0.5f, share);
    }

    static float contentShare(Bitmap b) {
        int w = b.getWidth(), h = b.getHeight(); int[] px = new int[w * h]; b.getPixels(px, 0, w, 0, 0, w, h); return contentShare(px, w, h);
    }
}
