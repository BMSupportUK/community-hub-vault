package uk.bmsupport.player;

import static org.junit.Assert.*;
import org.json.JSONObject;
import org.junit.Test;

public class ChannelHealthStartTest {
    private static JSONObject ev(long start) throws Exception { return new JSONObject().put("start", start); }
    @Test public void beforeEventStartsIsNotStarted() throws Exception { assertTrue(ChannelHealth.beforeStart(ev(10_000), 9_999)); }
    @Test public void afterEventStartsIsNotWorking() throws Exception { assertFalse(ChannelHealth.beforeStart(ev(10_000), 10_000)); }
    @Test public void noStartTimeIsNotWorking() throws Exception { assertFalse(ChannelHealth.beforeStart(new JSONObject(), 5)); }
}
