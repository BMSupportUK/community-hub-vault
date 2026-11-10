package uk.bmsupport.player;
import org.json.JSONArray;
import org.json.JSONObject;
import org.junit.Test;
import org.junit.runner.RunWith;
import org.robolectric.RobolectricTestRunner;
import org.robolectric.annotation.Config;
import static org.junit.Assert.*;
@RunWith(RobolectricTestRunner.class) @Config(sdk=34)
public class FixtureGuideTest {
 @Test public void sportsFixturesAreAuthoritative() throws Exception { JSONArray rows=new JSONArray().put("Fixture");assertSame(rows,FixtureGuide.listings("Coupang | Event 1",()->new JSONObject().put("source","sports").put("epg_listings",rows))); }
 @Test public void ordinaryChannelsNeverRequestWebsite() { assertNull(FixtureGuide.listings("BBC One",()->{fail("ordinary provider EPG");return null;})); }
 @Test public void unmatchedAndFailedReadsAllowProviderFallback() { assertNull(FixtureGuide.listings("Celtic TV",()->new JSONObject().put("source","none")));assertNull(FixtureGuide.listings("DAZN CA 18",()->{throw new Exception();})); }
 @Test public void matchedEventsOverlayOfficialProviderGuide() throws Exception {
  JSONArray ev=new JSONArray().put(new JSONObject().put("title","M").put("start_timestamp",200).put("stop_timestamp",300));
  JSONArray prov=new JSONArray().put(new JSONObject().put("title","A").put("start_timestamp",100).put("stop_timestamp",200)).put(new JSONObject().put("title","B").put("start_timestamp",250).put("stop_timestamp",350));
  JSONArray out=FixtureGuide.overlay(new JSONObject().put("source","sports_overlay").put("epg_listings",ev),prov);
  assertEquals(2,out.length()); assertEquals("A",out.getJSONObject(0).getString("title")); assertEquals("M",out.getJSONObject(1).getString("title"));
  assertTrue(FixtureGuide.candidate("Sky Sports Main Event | FHD |")); }
}
