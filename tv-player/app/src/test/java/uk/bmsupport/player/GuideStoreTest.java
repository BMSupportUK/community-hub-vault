package uk.bmsupport.player;

import static org.junit.Assert.*;

import org.junit.Test;

import java.util.*;

public class GuideStoreTest {
    @Test public void savedGuideDropsFinishedProgrammes() {
        Map<String, List<GuideGridView.Prog>> m = new LinkedHashMap<>();
        m.put("7", Arrays.asList(new GuideGridView.Prog("Old", 0, 500), new GuideGridView.Prog("News", 500, 9000)));
        Map<String, List<GuideGridView.Prog>> back = GuideStore.decode(GuideStore.encode(m, 1000), 1000);
        assertEquals(1, back.get("7").size());
        assertEquals("News", back.get("7").get(0).title);
    }
    @Test public void guideOlderThanTwelveHoursIsIgnored() {
        Map<String, List<GuideGridView.Prog>> m = new LinkedHashMap<>();
        m.put("7", Collections.singletonList(new GuideGridView.Prog("Late", 0, 999999)));
        assertTrue(GuideStore.decode(GuideStore.encode(m, 0), 12 * 3600 + 1).isEmpty());
    }
    @Test public void fullDayOnlyWhenEmptyOrMovedAhead() {
        List<GuideGridView.Prog> shortList = Collections.singletonList(new GuideGridView.Prog("Now", 0, 1800));
        assertFalse(GuideListings.needsFull(shortList, 100, 7200, 7300));
        assertTrue(GuideListings.needsFull(new ArrayList<>(), 100, 7200, 7300));
        assertTrue(GuideListings.needsFull(shortList, 100, 7200, 20000));
    }
}
