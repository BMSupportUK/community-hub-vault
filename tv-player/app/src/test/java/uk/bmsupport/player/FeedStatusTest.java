package uk.bmsupport.player;

import static org.junit.Assert.assertEquals;
import static org.junit.Assert.assertNull;

import org.junit.Test;

public final class FeedStatusTest {
    @Test public void healthyFeedHidesThePill() {
        assertNull(FeedStatus.label(false, false));
    }

    @Test public void stallShowsBuffering() {
        assertEquals("Buffering…", FeedStatus.label(false, true));
    }

    @Test public void blackScreenShowsNoPicture() {
        assertEquals("No picture", FeedStatus.label(true, false));
    }

    @Test public void noPictureWinsOverBuffering() {
        assertEquals("No picture", FeedStatus.label(true, true));
    }
}
