package uk.bmsupport.player;

import static org.junit.Assert.*;
import org.junit.Test;

public class PreviewHandoffTest {
    @Test public void carriesOnlyThePlayingPreviewOfTheSameLiveChannel() {
        assertTrue(PreviewHandoff.canCarry("live", "101", "101", true));
        assertFalse(PreviewHandoff.canCarry("live", "101", "202", true));
        assertFalse(PreviewHandoff.canCarry("live", "101", "101", false));
        assertFalse(PreviewHandoff.canCarry("catchup", "101", "101", true));
        assertFalse(PreviewHandoff.canCarry("film", "101", "101", true));
    }
    @Test public void staleOrOtherChannelHandoffIsNotClaimed() {
        assertTrue(PreviewHandoff.claimable("101", "101", 1000, 1000 + PreviewHandoff.MAX_AGE_MS));
        assertFalse(PreviewHandoff.claimable("101", "101", 1000, 1001 + PreviewHandoff.MAX_AGE_MS));
        assertFalse(PreviewHandoff.claimable("101", "202", 1000, 1000));
        assertFalse(PreviewHandoff.claimable(null, "101", 1000, 1000));
    }
    @Test public void fullScreenContinuesOnTheAddressThePreviewUses() {
        String[] urls = {"http://x/live/u/p/1.ts", "http://x/live/u/p/1.m3u8"};
        assertEquals(1, PreviewHandoff.indexOf("http://x/live/u/p/1.m3u8", urls));
        assertEquals(0, PreviewHandoff.indexOf("http://other", urls));
        assertEquals(0, PreviewHandoff.indexOf(null, urls));
    }
}
