package uk.bmsupport.player;

import static org.junit.Assert.*;
import org.junit.Test;

public class LiveSilentDropTest {
    @Test public void silentOfflineFeedRestartsAfterTwelveSeconds() {
        LiveReconnect r = new LiveReconnect();
        r.opened(0);
        assertFalse(r.stalled(100, 100, 0));
        assertFalse(r.stalled(100, 100, 24999));
        assertTrue(r.stalled(100, 100, 25000));
        assertEquals(1000, r.failed(25000));
    }
    @Test public void movingSoundOrPictureKeepsHealthyFeed() {
        LiveReconnect r = new LiveReconnect();
        r.stalled(1, 1, 0);
        assertFalse(r.stalled(1, 2, 24000));
        assertFalse(r.stalled(2, 2, 48000));
    }
    @Test public void reopeningWithoutPlaybackDoesNotResetTwoMinuteBudget() {
        LiveReconnect r = new LiveReconnect();
        r.failed(0);
        r.opened(119000);
        assertEquals(-1, r.failed(120000));
    }
}