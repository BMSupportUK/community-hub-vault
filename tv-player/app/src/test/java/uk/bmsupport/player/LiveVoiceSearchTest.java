package uk.bmsupport.player;

import java.util.List;
import org.json.JSONArray;
import org.json.JSONObject;
import org.junit.Test;
import org.junit.runner.RunWith;
import org.robolectric.RobolectricTestRunner;
import org.robolectric.annotation.Config;
import static org.junit.Assert.*;

@RunWith(RobolectricTestRunner.class)
@Config(sdk = 34, application = PlayerApplication.class)
public class LiveVoiceSearchTest {
    private final long now = 1794146400000L;
    private JSONArray categories() throws Exception { return new JSONArray("[{\"category_id\":\"nz\",\"category_name\":\"NZ Sky Sport\"},{\"category_id\":\"empty\",\"category_name\":\"Sky Sports Empty\"}]"); }
    private JSONArray channels() throws Exception { return new JSONArray("[{\"stream_id\":\"12\",\"name\":\"NZ Sky Sport 1\",\"category_id\":\"nz\"},{\"stream_id\":\"13\",\"name\":\"Sky News\",\"category_id\":\"nz\"}]"); }
    private JSONObject event() throws Exception { return new JSONObject().put("title", "Middlesbrough v Derby").put("competition", "Championship").put("channels", new JSONArray().put("Sky Sports Football")).put("start", now).put("end", now + 3600000L); }
    @Test public void groupsPreservePayloadAndNzMatching() throws Exception {
        List<LiveVoiceSearch.Row> rows = LiveVoiceSearch.results(categories(), channels(), "Show me Sky Sports");
        assertEquals(4, rows.size());
        assertEquals("Categories", rows.get(0).group); assertFalse(rows.get(0).selectable());
        assertEquals("nz", rows.get(1).value.optString("category_id"));
        assertEquals("TV channels", rows.get(2).group); assertFalse(rows.get(2).selectable());
        assertEquals("12", rows.get(3).value.optString("stream_id"));
        assertTrue(rows.stream().allMatch(r -> r.group.equals("Categories") || r.group.equals("TV channels")));
    }
    @Test public void eventOnlyNameCannotProduceLiveTvResults() throws Exception {
        List<LiveVoiceSearch.Row> rows = LiveVoiceSearch.results(categories(), channels(), event().optString("title"));
        assertEquals(4, rows.size());
        assertTrue(rows.stream().noneMatch(LiveVoiceSearch.Row::selectable));
    }
    @Test public void fillerOnlyCannotSelectEntirePlaylist() throws Exception {
        List<LiveVoiceSearch.Row> rows = LiveVoiceSearch.results(categories(), channels(), "Please show me live TV channels");
        assertEquals(4, rows.size());
        assertTrue(rows.stream().noneMatch(LiveVoiceSearch.Row::selectable));
    }
}