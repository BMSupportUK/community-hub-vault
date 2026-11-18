package uk.bmsupport.player;

import static org.junit.Assert.*;
import org.junit.Test;

public class LiveSilentDropTest {
    @Test public void silentOfflineFeedRestartsAfterTwelveSeconds() {
        LiveReconnect r = new LiveReconnect();
        r.opened(0);
        assertFalse(r.stalled(100, 100, 0));
        assertFalse(r.stalled(100, 100, 2999));
        assertTrue(r.stalled(100, 100, 3000));
        assertEquals(0, r.failed(3000));
    }
    @Test public void movingSoundOrPictureKeepsHealthyFeed() {
        LiveReconnect r = new LiveReconnect();
        r.stalled(1, 1, 0);
        assertFalse(r.stalled(1, 2, 2900));
        assertFalse(r.stalled(2, 2, 5800));
    }
    @Test public void reopeningWithoutPlaybackDoesNotResetTwoMinuteBudget() {
        LiveReconnect r = new LiveReconnect();
        r.failed(0);
        r.opened(119000);
        assertEquals(-1, r.failed(120000));
    }
}