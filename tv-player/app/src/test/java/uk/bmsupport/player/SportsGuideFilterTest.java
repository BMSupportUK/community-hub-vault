package uk.bmsupport.player;

import static org.junit.Assert.*;
import org.junit.Test;

public class SportsGuideFilterTest {
    // 6 Nov 2026 19:00 UK (GMT)
    private static final long NOW = 1793991600000L;

    @Test public void daysCountFromUkMidnight() {
        assertEquals(0, MainActivity.ukDayIndex(NOW + 3600_000L, NOW));          // 20:00 tonight
        assertEquals(1, MainActivity.ukDayIndex(NOW + 6 * 3600_000L, NOW));      // 01:00 Saturday
        assertEquals(0, MainActivity.ukDayIndex(NOW - 20 * 3600_000L, NOW));     // still on from yesterday
    }

    @Test public void categoryFilterUsesWebsiteMainThenSubCategory() {
        assertTrue(MainActivity.inSportsCategory("Football", "Mens", null, null));
        assertTrue(MainActivity.inSportsCategory("Football", "Mens", "Football", null));
        assertTrue(MainActivity.inSportsCategory("Football", "Mens", "Football", "Mens"));
        assertFalse(MainActivity.inSportsCategory("Football", "Mens", "Football", "Womens"));
        assertFalse(MainActivity.inSportsCategory("Football", "Mens", "Rugby", null));
    }
}
