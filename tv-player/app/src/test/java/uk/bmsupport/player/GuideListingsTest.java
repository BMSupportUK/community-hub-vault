package uk.bmsupport.player;

import static org.junit.Assert.*;

import android.util.Base64;

import org.json.JSONArray;
import org.json.JSONObject;
import org.junit.Test;
import org.junit.runner.RunWith;
import org.robolectric.RobolectricTestRunner;
import org.robolectric.annotation.Config;

import java.util.Arrays;
import java.util.List;

@RunWith(RobolectricTestRunner.class)
@Config(sdk = 34)
public class GuideListingsTest {
    private static JSONObject p(String t, long st, long en) throws Exception {
        return new JSONObject().put("title", Base64.encodeToString(t.getBytes("UTF-8"), Base64.NO_WRAP))
                .put("start_timestamp", st).put("stop_timestamp", en);
    }

    @Test public void eachProgrammeKeepsItsOwnTime() throws Exception {
        long now = 100_000;
        JSONArray l = new JSONArray().put(p("News", now + 1800, now + 3600)).put(p("Film", now - 600, now + 1800))
                .put(p("News", now + 1800, now + 3600)).put(p("Old", now - 9000, now - 7200));
        List<GuideGridView.Prog> got = GuideListings.parse(l, now);
        assertEquals(2, got.size());
        assertEquals("Film", got.get(0).title);
        assertEquals(now - 600, got.get(0).st);
        assertEquals("News", got.get(1).title);
        assertEquals(now + 1800, got.get(1).st);
    }

    @Test public void onlyNowIsTooShortAndNeedsTheFullDay() {
        long now = 100_000;
        List<GuideGridView.Prog> one = Arrays.asList(new GuideGridView.Prog("Now", now - 60, now + 600));
        assertTrue(GuideListings.tooShort(one, now, 7200));
        List<GuideGridView.Prog> day = Arrays.asList(new GuideGridView.Prog("A", now - 60, now + 600), new GuideGridView.Prog("B", now + 600, now + 9000));
        assertFalse(GuideListings.tooShort(day, now, 7200));
    }

    @Test public void nextDayNeedsMoreThanTodaysLineUp() {
        long now = 1_800_000_000L;
        List<GuideGridView.Prog> today = Arrays.asList(new GuideGridView.Prog("B", now, now + 20000));
        long tomorrowEnd = now + 86400 + 7200;
        assertTrue(GuideListings.stale(now - 60, today, now, 7200, tomorrowEnd, false));
        assertFalse(GuideListings.stale(now - 60, today, now, 7200, tomorrowEnd, true));
    }

    @Test public void websiteFixturesRefreshAfterOneMinute() {
        long now = 100_000;
        List<GuideGridView.Prog> day = Arrays.asList(new GuideGridView.Prog("B", now, now + 20000));
        assertEquals(60, GuideListings.REFRESH_SECS);
        assertFalse(GuideListings.stale(now - 59, day, now, 7200));
        assertTrue(GuideListings.stale(now - 60, day, now, 7200));
    }
}
