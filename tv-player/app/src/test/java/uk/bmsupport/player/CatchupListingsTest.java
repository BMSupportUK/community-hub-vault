package uk.bmsupport.player;
import org.json.JSONObject;
import org.junit.Test;
import org.junit.runner.RunWith;
import org.robolectric.RobolectricTestRunner;
import org.robolectric.annotation.Config;
import static org.junit.Assert.*;

@RunWith(RobolectricTestRunner.class)
@Config(sdk = 34)
public class CatchupListingsTest {
    @Test public void readsEndTimestampAndMillis() throws Exception {
        JSONObject row = new JSONObject("{\"start_timestamp\":1793728800000,\"end_timestamp\":1793732400}");
        assertEquals(1793728800L, CatchupListings.time(row, false, "Europe/London"));
        assertEquals(1793732400L, CatchupListings.time(row, true, "Europe/London"));
    }
    @Test public void readsProviderDateStrings() throws Exception {
        JSONObject row = new JSONObject("{\"start\":\"2026-11-03 18:00:00\",\"end\":\"2026-11-03 19:00:00\"}");
        assertEquals(1793728800L, CatchupListings.time(row, false, "Europe/London"));
        assertEquals(1793732400L, CatchupListings.time(row, true, "Europe/London"));
    }
    @Test public void onlyFinishedRetainedProgrammesArePlayable() throws Exception {
        JSONObject row = new JSONObject();
        assertTrue(CatchupListings.available(row, 1793728800L, 1793732400L, 1793740320L, 7));
        assertFalse(CatchupListings.available(row, 1793728800L, 1793752400L, 1793740320L, 7));
        assertFalse(CatchupListings.available(row.put("has_archive", 0), 1793728800L, 1793732400L, 1793740320L, 7));
    }
}