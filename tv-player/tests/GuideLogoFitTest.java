package uk.bmsupport.player;

public final class GuideLogoFitTest {
    private static void check(boolean condition, String message) {
        if (!condition) throw new AssertionError(message);
    }
    private static void near(float a, float b, String message) {
        if (Math.abs(a - b) > 0.001f) throw new AssertionError(message + " (" + a + " != " + b + ")");
    }
    public static void main(String[] args) {
        float d = 2f, rowH = 128f, top = 36f;
        float[] slot = GuideLogoFit.slot(0, top, rowH, d);
        near(slot[0], 12f, "Slot starts one padding in");
        near(slot[1], top + 12f, "Slot is padded from the row top");
        near(slot[2] - slot[0], rowH - 24f, "Slot is square");
        near(slot[3] - slot[1], rowH - 24f, "Slot height matches width");

        float[] wide = GuideLogoFit.fit(200, 100, slot);
        near(wide[2] - wide[0], slot[2] - slot[0], "Wide logo fills the slot width");
        near((wide[3] - wide[1]) * 2, wide[2] - wide[0], "Wide logo keeps its 2:1 shape");
        near((wide[1] + wide[3]) / 2, (slot[1] + slot[3]) / 2, "Wide logo is vertically centred");

        float[] tall = GuideLogoFit.fit(100, 200, slot);
        near(tall[3] - tall[1], slot[3] - slot[1], "Tall logo fills the slot height");
        near((tall[0] + tall[2]) / 2, (slot[0] + slot[2]) / 2, "Tall logo is horizontally centred");

        float[] square = GuideLogoFit.fit(50, 50, slot);
        near(square[2] - square[0], slot[2] - slot[0], "Square logo fills the slot");

        float[] zero = GuideLogoFit.fit(0, 0, slot);
        near(zero[0], slot[0], "Empty image falls back to the slot");

        near(GuideLogoFit.textStart(slot, d), slot[2] + 8f, "Channel name starts after the logo");
        System.out.println("11 guide-logo checks passed");
    }
}
