package uk.bmsupport.player;

/**
 * Pure geometry for provider logos in the TV guide channel column, kept free of Android classes
 * so the JVM tests can check it. Rectangles are float arrays {left, top, right, bottom}.
 */
public final class GuideLogoFit {
    private GuideLogoFit() {}

    /** Square slot at the left edge of a channel cell, vertically centred. */
    public static float[] slot(float cellLeft, float cellTop, float rowH, float d) {
        float pad = 6 * d;
        float side = rowH - 2 * pad;
        return new float[]{cellLeft + pad, cellTop + pad, cellLeft + pad + side, cellTop + pad + side};
    }

    /** Fit an image inside the slot keeping its shape: never cropped, never stretched, centred. */
    public static float[] fit(float imgW, float imgH, float[] slot) {
        if (imgW <= 0 || imgH <= 0) return slot.clone();
        float slotW = slot[2] - slot[0], slotH = slot[3] - slot[1];
        float scale = Math.min(slotW / imgW, slotH / imgH);
        float w = imgW * scale, h = imgH * scale;
        float l = slot[0] + (slotW - w) / 2, t = slot[1] + (slotH - h) / 2;
        return new float[]{l, t, l + w, t + h};
    }

    /** X position where the channel name starts when a logo is shown. */
    public static float textStart(float[] slot, float d) {
        return slot[2] + 4 * d;
    }
}
