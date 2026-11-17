package uk.bmsupport.player;

import static org.junit.Assert.assertEquals;
import java.util.ArrayList;
import java.util.Arrays;
import java.util.List;
import org.junit.Test;

public class ChannelNumberOrderTest {
    @Test public void numberedSiblingsCountUpwards() {
        List<String> l = new ArrayList<>(Arrays.asList("AU | Stan Sport 30", "AU | Stan Sport 29", "AU | Kayo", "AU | Stan Sport 2", "AU | Stan Sport 1"));
        ChannelNumberOrder.sort(l, s -> s);
        assertEquals(Arrays.asList("AU | Stan Sport 1", "AU | Stan Sport 2", "AU | Kayo", "AU | Stan Sport 29", "AU | Stan Sport 30"), l);
    }
    @Test public void unnumberedChannelsKeepProviderOrder() {
        List<String> l = new ArrayList<>(Arrays.asList("Sky News", "BBC One", "ITV"));
        ChannelNumberOrder.sort(l, s -> s);
        assertEquals(Arrays.asList("Sky News", "BBC One", "ITV"), l);
    }
}
