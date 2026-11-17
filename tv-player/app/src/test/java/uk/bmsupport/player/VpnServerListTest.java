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
 @Test public void keepsWebsiteCountryOrderNotTrafficOnly() throws Exception {
  JSONArray rows=new JSONArray().put(new JSONObject().put("id",1).put("traffic",900000000)).put(new JSONObject().put("id",2).put("traffic",180000000)).put(new JSONObject().put("id",3));
  java.util.List<JSONObject> sorted=VpnServerList.sorted(rows);
  assertEquals(1,sorted.get(0).getInt("id"));assertEquals(2,sorted.get(1).getInt("id"));assertEquals(3,sorted.get(2).getInt("id"));
 }
 @Test public void everyRowHasItsReadingAndBarAndSelectionReturnsFirstServer() throws Exception {
  android.app.Activity a=org.robolectric.Robolectric.buildActivity(android.app.Activity.class).setup().get();
  JSONArray rows=new JSONArray().put(new JSONObject().put("id",1).put("city","London").put("country","GB").put("traffic",900000000).put("traffic_bar",100)).put(new JSONObject().put("id",2).put("city","Brussels").put("country","BE").put("traffic",180000000).put("traffic_bar",20)).put(new JSONObject().put("id",3).put("city","Unknown"));
  int[] selected={0};VpnServerList.show(a,rows,id->selected[0]=id,"Keep watching");
  android.app.AlertDialog dialog=org.robolectric.shadows.ShadowAlertDialog.getLatestAlertDialog();
  android.widget.ListView list=findList(dialog.getWindow().getDecorView());assertNotNull(list);
  assertEquals(3,list.getAdapter().getCount());
  for(int i=0;i<3;i++){
   android.widget.LinearLayout row=(android.widget.LinearLayout)list.getAdapter().getView(i,null,list);
   assertTrue(row.getChildAt(1) instanceof android.widget.TextView);
   assertTrue(row.getChildAt(2) instanceof android.widget.ProgressBar);
   android.widget.ProgressBar bar=(android.widget.ProgressBar)row.getChildAt(2);
   assertEquals(i==0?100:i==1?20:0,bar.getProgress());
   assertEquals(i==2?android.view.View.INVISIBLE:android.view.View.VISIBLE,bar.getVisibility());
  }
  list.performItemClick(list.getAdapter().getView(0,null,list),0,2);
  assertEquals(1,selected[0]);assertFalse(dialog.isShowing());assertFalse(a.isFinishing());
 }
 @Test public void rowNamesThePingAsTheVpnServersOwn() throws Exception {
  android.app.Activity a=org.robolectric.Robolectric.buildActivity(android.app.Activity.class).setup().get();
  JSONArray rows=new JSONArray().put(new JSONObject().put("id",1).put("city","London").put("country","GB").put("traffic",180000000).put("traffic_bar",20).put("ping",25));
  VpnServerList.show(a,rows,id->{},"Keep watching");
  android.app.AlertDialog dialog=org.robolectric.shadows.ShadowAlertDialog.getLatestAlertDialog();
  android.widget.ListView list=findList(dialog.getWindow().getDecorView());
  android.widget.LinearLayout row=(android.widget.LinearLayout)list.getAdapter().getView(0,null,list);
  assertEquals("VPN ping 25 ms · Traffic · 180,000,000",((android.widget.TextView)row.getChildAt(1)).getText().toString());
 }
 @Test public void groupThenLowestPingFirst() throws Exception {
  JSONArray rows=new JSONArray()
   .put(new JSONObject().put("id",1).put("group",0).put("ping",80))
   .put(new JSONObject().put("id",2).put("group",0).put("ping",20))
   .put(new JSONObject().put("id",3).put("group",1).put("ping",5))
   .put(new JSONObject().put("id",4).put("group",0));
  java.util.List<JSONObject> s=VpnServerList.sorted(rows);
  assertEquals(2,s.get(0).getInt("id"));assertEquals(1,s.get(1).getInt("id"));assertEquals(4,s.get(2).getInt("id"));assertEquals(3,s.get(3).getInt("id"));
 }
 private android.widget.ListView findList(android.view.View v){
  if(v instanceof android.widget.ListView)return (android.widget.ListView)v;
  if(v instanceof android.view.ViewGroup){android.view.ViewGroup g=(android.view.ViewGroup)v;for(int i=0;i<g.getChildCount();i++){android.widget.ListView found=findList(g.getChildAt(i));if(found!=null)return found;}}
  return null;
 }
}
