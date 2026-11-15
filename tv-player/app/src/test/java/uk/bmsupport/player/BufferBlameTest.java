package uk.bmsupport.player;

import static org.junit.Assert.*;
import org.junit.Test;

public class BufferBlameTest {
    @Test public void soundDropIsTheStream() { assertEquals("stream", BufferBlame.judge("audio_drop", 30, 6000, -1)); }
    @Test public void serverStopsWithGoodPingIsTheStream() { assertEquals("stream", BufferBlame.judge("network_drop", 40, 6000, -1)); }
    @Test public void pingOver400IsTheCustomer() { assertEquals("customer", BufferBlame.judge("network_drop", 450, 6000, -1)); }
    @Test public void slowBroadbandIsTheCustomer() { assertEquals("customer", BufferBlame.judge("network_drop", 40, 6000, 8000)); }
    @Test public void fastBroadbandGoodPingStaysStream() { assertEquals("stream", BufferBlame.judge("network_drop", 40, 6000, 50000)); }
    @Test public void noReadingsIsUnclear() { assertEquals("unclear", BufferBlame.judge("network_drop", -1, -1, -1)); }
    @Test public void middlingPingIsUnclear() { assertEquals("unclear", BufferBlame.judge("network_drop", 300, 6000, -1)); }
}
