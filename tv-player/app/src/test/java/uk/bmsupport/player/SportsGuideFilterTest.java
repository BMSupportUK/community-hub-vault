package uk.bmsupport.player;

import static org.junit.Assert.*;
import org.json.JSONObject;
import org.junit.Test;

public class SportsGuideFilterTest {
    // 6 Nov 2026 19:00 UK (GMT)
    private static final long NOW = 1793991600000L;

    @Test public void daysCountFromUkMidnight() {
        assertEquals(0, MainActivity.ukDayIndex(NOW + 3600_000L, NOW));          // 20:00 tonight
        assertEquals(1, MainActivity.ukDayIndex(NOW + 6 * 3600_000L, NOW));      // 01:00 Saturday
        assertEquals(0, MainActivity.ukDayIndex(NOW - 20 * 3600_000L, NOW));     // still on from yesterday
    }

    @Test public void categoryFilterUsesWebsiteMainThenSubCategory() throws Exception {
        JSONObject e = new JSONObject().put("sport", "Football").put("subcategory", "Mens");
        assertTrue(MainActivity.inSportsCategory(e, null, null));
        assertTrue(MainActivity.inSportsCategory(e, "Football", null));
        assertTrue(MainActivity.inSportsCategory(e, "Football", "Mens"));
        assertFalse(MainActivity.inSportsCategory(e, "Football", "Womens"));
        assertFalse(MainActivity.inSportsCategory(e, "Rugby", null));
    }
}
