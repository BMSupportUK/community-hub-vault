package uk.bmsupport.player;

import android.app.Activity;
import android.app.AlertDialog;
import android.view.View;
import android.view.ViewGroup;
import android.widget.BaseAdapter;
import android.widget.LinearLayout;
import android.widget.ListView;
import android.widget.ProgressBar;
import android.widget.TextView;
import org.json.JSONArray;
import org.json.JSONObject;
import java.util.ArrayList;
import java.util.List;
import java.util.function.Consumer;

/** Same website-ordered picker in Settings and both playback engines. */
final class VpnServerList {
    static List<JSONObject> sorted(JSONArray array) {
        List<JSONObject> rows = new ArrayList<>();
        for (int i=0; array!=null && i<array.length(); i++) {
            JSONObject row=array.optJSONObject(i);
            if(row!=null && row.optInt("id",-1)>0) rows.add(row);
        }
        // Website groups: the box's country, then nearby, far-away last. Within a group lowest ping first
        // (10 ms steps so tiny differences keep the website's traffic order); unmeasured rows keep their place after.
        java.util.Map<JSONObject,Integer> at=new java.util.IdentityHashMap<>();for(int i=0;i<rows.size();i++)at.put(rows.get(i),i);
        rows.sort((a,b)->{int g=Integer.compare(a.optInt("group",0),b.optInt("group",0));if(g!=0)return g;
            int pa=a.optInt("ping",-1),pb=b.optInt("ping",-1);
            if(pa>0&&pb>0&&pa/10!=pb/10)return Integer.compare(pa,pb);
            if((pa>0)!=(pb>0))return pa>0?-1:1;
            return Integer.compare(at.get(a),at.get(b));});
        return rows;
    }
    static double traffic(JSONObject row) {
        double value=row.optDouble("traffic",Double.NaN);
        return Double.isFinite(value)&&value>=0?value:Double.POSITIVE_INFINITY;
    }
    static void show(Activity a, JSONArray array, Consumer<Integer> pick, String close) {
        List<JSONObject> rows=sorted(array);
        ListView list=new ListView(a);
        list.setAdapter(new BaseAdapter(){
            public int getCount(){return rows.size();}
            public Object getItem(int i){return rows.get(i);}
            public long getItemId(int i){return rows.get(i).optInt("id");}
            public View getView(int i,View recycled,ViewGroup parent){
                JSONObject row=rows.get(i);
                LinearLayout box=new LinearLayout(a);box.setOrientation(LinearLayout.VERTICAL);
                int pad=(int)(16*a.getResources().getDisplayMetrics().density);box.setPadding(pad,pad,pad,pad);
                TextView name=new TextView(a);name.setTextSize(17);name.setText(row.optString("city")+" ("+row.optString("country")+")");box.addView(name);
                TextView number=new TextView(a);number.setTextSize(13);
                double value=traffic(row);
                int ping=row.optInt("ping",-1);number.setText((ping>0?"VPN ping "+ping+" ms · ":"")+(Double.isFinite(value)?"Traffic · "+java.text.NumberFormat.getNumberInstance(java.util.Locale.UK).format(value):"Traffic unavailable"));box.addView(number);
                ProgressBar bar=new ProgressBar(a,null,android.R.attr.progressBarStyleHorizontal);bar.setMax(100);bar.setProgress(row.optInt("traffic_bar",0));bar.setVisibility(Double.isFinite(value)?View.VISIBLE:View.INVISIBLE);
                box.addView(bar,new LinearLayout.LayoutParams(ViewGroup.LayoutParams.MATCH_PARENT,pad));
                return box;
            }
        });
        AlertDialog dialog=new AlertDialog.Builder(a).setTitle("Change VPN location").setView(list).setNegativeButton(close,null).create();
        list.setOnItemClickListener((p,v,index,id)->{dialog.dismiss();pick.accept(rows.get(index).optInt("id"));});
        dialog.show();
        android.view.Window window=dialog.getWindow();
        if(window!=null)window.setLayout(Math.min(a.getResources().getDisplayMetrics().widthPixels,(int)(560*a.getResources().getDisplayMetrics().density)),(int)(a.getResources().getDisplayMetrics().heightPixels*.8));
    }
}