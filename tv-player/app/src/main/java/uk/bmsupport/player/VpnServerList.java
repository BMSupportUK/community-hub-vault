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

/** Same traffic-ranked picker in Settings and both playback engines. */
final class VpnServerList {
    static List<JSONObject> sorted(JSONArray array) {
        List<JSONObject> rows = new ArrayList<>();
        for (int i=0; array!=null && i<array.length(); i++) {
            JSONObject row=array.optJSONObject(i);
            if(row!=null && row.optInt("id",-1)>0) rows.add(row);
        }
        rows.sort((a,b)->Double.compare(traffic(a),traffic(b)));
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
                number.setText(Double.isFinite(value)?"Traffic · "+java.text.NumberFormat.getNumberInstance(java.util.Locale.UK).format(value):"Traffic unavailable");box.addView(number);
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