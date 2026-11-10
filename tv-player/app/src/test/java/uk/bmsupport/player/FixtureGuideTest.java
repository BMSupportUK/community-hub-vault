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
}
