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
    @Test public void shortDeliveryDipDoesNotLowerRating() {
        ChannelLink l = new ChannelLink(); l.ping(30);
        l.bytes(0, 0, 0); l.bytes(800_000, 1_000_000, 6000);
        assertEquals("Excellent", l.rating(65_999));
    }
    @Test public void deliveryShortfallLastingAMinuteIsPoor() {
        ChannelLink l = new ChannelLink(); l.ping(30);
        l.bytes(0, 0, 0); l.bytes(800_000, 1_000_000, 6000);
        assertEquals("Poor", l.rating(66_000)); assertEquals(60_000, l.poorMs(66_000));
    }
    @Test public void slightShortfallLastingAMinuteIsFair() {
        ChannelLink l = new ChannelLink(); l.ping(30);
        l.bytes(0, 0, 0); l.bytes(950_000, 1_000_000, 6000);
        assertEquals("Fair", l.rating(66_000));
    }
    @Test public void recoveringClearsTheShortfallClock() {
        ChannelLink l = new ChannelLink(); l.ping(30);
        l.bytes(0, 0, 0); l.bytes(800_000, 1_000_000, 6000); l.bytes(3_800_000, 2_000_000, 12_000);
        assertEquals(0, l.poorMs(80_000)); assertEquals("Excellent", l.rating(80_000));
    }
    @Test public void stallsAndReconnectsCountForTwoMinutes() {
        ChannelLink l = new ChannelLink(); l.ping(30); l.stalled(0);
        assertEquals("Fair", l.rating(1000));
        assertEquals("Excellent", l.rating(121_000));
        l.reconnected(200_000); assertEquals("Fair", l.rating(201_000));
        l.reconnected(210_000); assertEquals("Poor", l.rating(211_000));
    }
    @Test public void snapshotUsesExactlyThePillsTwoMinuteWindow() {
        ChannelLink l = new ChannelLink(); l.ping(38); l.stalled(0); l.reconnected(1000);
        assertEquals(38, l.pingMs());
        assertEquals(1, l.stalls(120_000)); assertEquals(1, l.reconnects(120_000));
        assertEquals("Fair", l.rating(120_000));
        assertEquals(0, l.stalls(120_001)); assertEquals(1, l.reconnects(120_001));
        assertEquals(0, l.reconnects(121_001)); assertEquals("Excellent", l.rating(121_001));
    }
    @Test public void snapshotIncludesExactSmoothedDeliveryRatio() {
        ChannelLink l = new ChannelLink(); l.ping(38);
        l.bytes(0, 0, 0); l.bytes(800_000, 1_000_000, 6000);
        assertEquals(0.8, l.deliveryRatio(), 0.00001); assertEquals("Excellent", l.rating(6000));
    }
    @Test public void serverChangeClearsPoorReading() {
        ChannelLink l = new ChannelLink(); l.ping(30); l.reconnected(1000); l.reconnected(1500);
        assertEquals("Poor", l.rating(2000)); l.serverChanged(2_000); l.ping(30);
        assertEquals("Excellent", l.rating(3000));
    }
    @Test public void reconnectRightAfterVpnSwitchIsNotCounted() {
        ChannelLink l = new ChannelLink(); l.serverChanged(10_000); l.ping(40);
        l.reconnected(20_000); assertEquals("Excellent", l.rating(21_000));
        l.reconnected(100_000); assertEquals("Fair", l.rating(101_000));
    }
    @Test public void reconnectWhileChannelOpensIsNotCounted() {
        ChannelLink l = new ChannelLink(); l.channelOpened(5_000); l.ping(26);
        l.reconnected(25_000); assertEquals("Excellent", l.rating(26_000));
    }
    @Test public void ratingStaysSteadyThroughVpnSwitch() {
        ChannelLink l = new ChannelLink(); l.ping(40); assertEquals("Excellent", l.rating(1_000));
        l.serverChanged(2_000);
        l.stalled(5_000); l.reconnected(6_000); l.bytes(0, 0, 7_000); l.bytes(10, 1000, 13_000);
        assertEquals("Excellent", l.rating(14_000));
    }
    @Test public void labelNamesThePingAsTheChannelsOwn() {
        ChannelLink l = new ChannelLink(); l.ping(67);
        assertEquals("Channel connection: Excellent · Channel ping 67 ms", l.label(1_000));
    }
}
