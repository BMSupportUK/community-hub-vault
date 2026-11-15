package uk.bmsupport.player;

import static org.junit.Assert.assertEquals;
import org.junit.Test;

public class ChannelLinkTest {
    @Test public void fastServerAndSmoothPlaybackIsExcellent() {
        ChannelLink l = new ChannelLink(); l.ping(30);
        l.bytes(0, 0, 0); l.bytes(1_000_000, 1_000_000, 6000);
        assertEquals("Excellent", l.rating(6000));
    }
    @Test public void slowPingIsFairOrPoor() {
        ChannelLink l = new ChannelLink(); l.ping(250); assertEquals("Fair", l.rating(0));
        ChannelLink p = new ChannelLink(); p.ping(500); assertEquals("Poor", p.rating(0));
    }
    @Test public void dataArrivingSlowerThanChannelNeedsIsPoor() {
        ChannelLink l = new ChannelLink(); l.ping(30);
        l.bytes(0, 0, 0); l.bytes(800_000, 1_000_000, 6000);
        assertEquals("Poor", l.rating(6000));
    }
    @Test public void stallsAndReconnectsCountForTwoMinutes() {
        ChannelLink l = new ChannelLink(); l.ping(30); l.stalled(0);
        assertEquals("Fair", l.rating(1000));
        assertEquals("Excellent", l.rating(121_000));
        l.reconnected(200_000); assertEquals("Poor", l.rating(201_000));
    }
}
