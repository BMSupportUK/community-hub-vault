package uk.bmsupport.player;
import static org.junit.Assert.assertArrayEquals;
import org.junit.Test;
public class VlcLiveOrderTest {
    @Test public void vlcStartsLiveChannelsOnHls() {
        assertArrayEquals(new String[]{"a.m3u8", "a.ts", "a"}, MainActivity.vlcLiveOrder(new String[]{"a.ts", "a.m3u8", "a"}));
    }
}
