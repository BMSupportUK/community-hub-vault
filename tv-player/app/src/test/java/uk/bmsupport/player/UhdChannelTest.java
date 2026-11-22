package uk.bmsupport.player;

import static org.junit.Assert.*;
import org.junit.Test;

public class UhdChannelTest {
    @Test public void uhdAndFourKNamesCount() {
        assertTrue(UhdChannel.is("Sky Sports Main Event UHD | Test"));
        assertTrue(UhdChannel.is("Sky Sports F1 4K"));
        assertFalse(UhdChannel.is("BBC One | FHD |"));
        assertFalse(UhdChannel.is("Sky Sports F1 HD"));
    }
    @Test public void uhdLiveStartsInBoxEngine() {
        assertFalse(PlayerActivity.backupFirst("live", false, false, "Sky Sports F1 UHD | Test"));
        assertFalse(PlayerActivity.backupFirst("live", false, false, "BBC One | FHD |"));
    }
    @Test public void uhdWaitsLongerBeforeCountingADrop() {
        LiveReconnect r = new LiveReconnect(); r.patient(true); r.opened(0);
        assertFalse(r.noData(100, 0)); assertFalse(r.noData(100, 15_000));
        assertFalse(r.stalled(5, 5, 0)); assertFalse(r.stalled(5, 5, 20_000));
        assertTrue(r.stalled(5, 5, 31_000));
    }
    @Test public void hdKeepsItsQuickReconnect() {
        LiveReconnect r = new LiveReconnect(); r.opened(0);
        assertFalse(r.stalled(5, 5, 0)); assertFalse(r.stalled(5, 5, 24_999)); assertTrue(r.stalled(5, 5, 25_000));
    }
}
