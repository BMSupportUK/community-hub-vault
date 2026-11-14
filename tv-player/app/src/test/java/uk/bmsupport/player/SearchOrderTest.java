package uk.bmsupport.player;

import java.util.ArrayList;
import java.util.Arrays;
import java.util.List;
import org.json.JSONArray;
import org.junit.Test;
import org.junit.runner.RunWith;
import org.robolectric.RobolectricTestRunner;
import org.robolectric.annotation.Config;
import static org.junit.Assert.*;

@RunWith(RobolectricTestRunner.class)
@Config(sdk = 34, application = PlayerApplication.class)
public class SearchOrderTest {
    private static List<String> sorted(String... names) {
        List<String> l = new ArrayList<>(Arrays.asList(names)); l.sort(SearchOrder::compare); return l;
    }
    @Test public void providerTagsInFrontAreIgnored() {
        assertEquals(Arrays.asList("UK: BBC One", "|UK| ITV 1", "[VIP] Sky Cinema"), sorted("[VIP] Sky Cinema", "|UK| ITV 1", "UK: BBC One"));
    }
    @Test public void numbersSortAsNumbers() {
        assertEquals(Arrays.asList("Sky Sports 2", "Sky Sports 10"), sorted("Sky Sports 10", "Sky Sports 2"));
    }
    @Test public void symbolsAndCaseDoNotPushNamesOutOfOrder() {
        assertEquals(Arrays.asList("⭐ alpha", "Beta", "gamma"), sorted("gamma", "Beta", "⭐ alpha"));
    }
    @Test public void voiceChannelsListByCategoryThenAToZ() throws Exception {
        JSONArray cats = new JSONArray("[{\"category_id\":\"2\",\"category_name\":\"UK Sports\"},{\"category_id\":\"1\",\"category_name\":\"NZ Sport\"}]");
        JSONArray chs = new JSONArray("[{\"stream_id\":\"a\",\"name\":\"Sport Zeta\",\"category_id\":\"1\"},{\"stream_id\":\"b\",\"name\":\"Sport Alpha\",\"category_id\":\"2\"},{\"stream_id\":\"c\",\"name\":\"Sport Beta\",\"category_id\":\"1\"}]");
        List<LiveVoiceSearch.Row> rows = LiveVoiceSearch.results(cats, chs, "sport");
        assertEquals("NZ Sport", rows.get(1).title); assertEquals("UK Sports", rows.get(2).title);
        assertEquals("c", rows.get(4).value.optString("stream_id"));
        assertEquals("a", rows.get(5).value.optString("stream_id"));
        assertEquals("b", rows.get(6).value.optString("stream_id"));
    }
}
