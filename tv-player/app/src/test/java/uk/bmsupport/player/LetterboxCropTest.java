package uk.bmsupport.player;

import static org.junit.Assert.assertEquals;
import org.junit.Test;

public class LetterboxCropTest {
    private static int[] frame(int w, int h, int bar) {
        int[] px = new int[w * h];
        for (int y = 0; y < h; y++) for (int x = 0; x < w; x++) px[y * w + x] = (y < bar || y >= h - bar) ? 0xFF000000 : 0xFF808080;
        return px;
    }
    @Test public void barsTopAndBottomAreZoomedPast() { assertEquals(0.75f, LetterboxCrop.contentShare(frame(96, 56, 7), 96, 56), 0.001f); }
    @Test public void fullPictureStaysAsIs() { assertEquals(1f, LetterboxCrop.contentShare(frame(96, 56, 0), 96, 56), 0.001f); }
    @Test public void allDarkSceneIsNotBars() { assertEquals(1f, LetterboxCrop.contentShare(frame(96, 56, 28), 96, 56), 0.001f); }
}
