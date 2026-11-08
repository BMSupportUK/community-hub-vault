package uk.bmsupport.player;

import static org.junit.Assert.*;

import java.util.Arrays;
import java.util.Collections;
import java.util.List;

import org.junit.Test;

public class ChannelSwapTest {
    private static ChannelSwap.Option o(String id, String name, boolean ev) { return new ChannelSwap.Option(id, name, name, new String[]{"http://x/" + id}, ev); }

    @Test public void eventFeedsComeBeforeOtherVersionsAndCurrentIsDropped() {
        List<ChannelSwap.Option> r = ChannelSwap.build("1", Arrays.asList(o("1", "Sky Sports Main Event", true), o("2", "TNT Sports 1", true)),
            Arrays.asList(o("3", "Sky Sports Main Event UHD", false), o("2", "TNT Sports 1", false)), Collections.emptySet());
        assertEquals(2, r.size());
        assertEquals("2", r.get(0).id); assertTrue(r.get(0).sameEvent);
        assertEquals("3", r.get(1).id);
    }

    @Test public void notWorkingChannelsGoLastAndAreLabelled() {
        List<ChannelSwap.Option> r = ChannelSwap.build("1", Arrays.asList(o("2", "DAZN CA 18", true), o("3", "DAZN CA 04", true)), null,
            Collections.singleton("dazn ca 18"));
        assertEquals("3", r.get(0).id);
        assertTrue(r.get(1).down);
        assertTrue(ChannelSwap.label(r.get(1)).contains("Not working"));
    }
}
