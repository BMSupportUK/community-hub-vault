package uk.bmsupport.player;

import org.json.JSONArray;
import org.json.JSONObject;
import org.junit.Test;
import org.junit.runner.RunWith;
import org.robolectric.RobolectricTestRunner;
import org.robolectric.annotation.Config;
import static org.junit.Assert.*;

@RunWith(RobolectricTestRunner.class)
@Config(sdk = 34)
public class StreamClaimTest {
    @Test public void namesTheOtherDeviceAndWhatItIsWatching() throws Exception {
        JSONArray d = new JSONArray().put(new JSONObject().put("name", "BM Player Windows").put("title", "BBC Two | FHD"));
        assertEquals("BM Player Windows is watching BBC Two | FHD.", StreamClaim.describe(d));
    }
    @Test public void unknownDevicesStillGetAClearMessage() {
        assertEquals("Another device is watching on this login.", StreamClaim.describe(null));
    }
    @Test public void episodesClaimAsSeries() {
        assertEquals("series", StreamClaim.apiKind("episode"));
        assertEquals("live", StreamClaim.apiKind("live"));
    }
}
