package uk.bmsupport.player;
import org.junit.Test;
import org.junit.runner.RunWith;
import org.robolectric.RobolectricTestRunner;
import org.robolectric.annotation.Config;
import org.json.JSONArray;
import org.json.JSONObject;
import static org.junit.Assert.*;
@RunWith(RobolectricTestRunner.class) @Config(sdk=34)
public class VpnServerListTest {
 @Test public void lowestTrafficIsFirstAndUnknownIsLast() throws Exception {
  JSONArray rows=new JSONArray().put(new JSONObject().put("id",1).put("traffic",900000000)).put(new JSONObject().put("id",2).put("traffic",180000000)).put(new JSONObject().put("id",3));
  java.util.List<JSONObject> sorted=VpnServerList.sorted(rows);
  assertEquals(2,sorted.get(0).getInt("id"));assertEquals(1,sorted.get(1).getInt("id"));assertEquals(3,sorted.get(2).getInt("id"));
 }
}