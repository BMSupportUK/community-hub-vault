package uk.bmsupport.player;

import static org.junit.Assert.*;
import android.app.Activity;
import android.app.AlertDialog;
import android.content.SharedPreferences;
import android.view.View;
import android.view.ViewGroup;
import android.widget.Button;
import android.widget.EditText;
import android.widget.ListView;
import java.lang.reflect.Field;
import java.lang.reflect.Method;
import java.util.ArrayList;
import java.util.Arrays;
import java.util.HashSet;
import java.util.List;
import java.util.Set;
import org.junit.Test;
import org.junit.runner.RunWith;
import org.robolectric.Robolectric;
import org.robolectric.RobolectricTestRunner;
import org.robolectric.annotation.Config;
import org.robolectric.shadows.ShadowAlertDialog;

@RunWith(RobolectricTestRunner.class)
@Config(sdk=28, qualifiers="w960dp-h540dp-mdpi", application=PlayerApplication.class)
public class BoxFeedbackTest {
    private MainActivity activity() throws Exception {
        MainActivity a=Robolectric.buildActivity(MainActivity.class).get();
        Field f=MainActivity.class.getDeclaredField("prefs"); f.setAccessible(true);
        SharedPreferences p=a.getSharedPreferences("box-feedback",0); p.edit().clear().commit(); f.set(a,p);
        return a;
    }
    private void call(MainActivity a,String name) throws Exception {
        Method m=MainActivity.class.getDeclaredMethod(name);m.setAccessible(true);m.invoke(a);
    }
    private Button button(View v,String label) {
        if(v instanceof Button && label.contentEquals(((Button)v).getText())) return (Button)v;
        if(v instanceof ViewGroup) for(int i=0;i<((ViewGroup)v).getChildCount();i++) { Button b=button(((ViewGroup)v).getChildAt(i),label);if(b!=null)return b; }
        return null;
    }
    private EditText entry(View v) {
        if(v instanceof EditText)return (EditText)v;
        if(v instanceof ViewGroup)for(int i=0;i<((ViewGroup)v).getChildCount();i++){EditText e=entry(((ViewGroup)v).getChildAt(i));if(e!=null)return e;}
        return null;
    }
    @Test public void movingThenHidingTargetsThePickedCategoryAndPersists() {
        Activity a=Robolectric.buildActivity(Activity.class).setup().get();
        List<String[]> rows=new ArrayList<>(Arrays.asList(new String[]{"1","News"},new String[]{"2","Sport"},new String[]{"3","Drama"}));
        Set<String> hidden=new HashSet<>(); ListView list=CategoryEditor.create(a,rows,hidden);a.setContentView(list);
        list.performItemClick(null,2,2);
        ShadowAlertDialog.getLatestAlertDialog().getListView().performItemClick(null,0,0);
        assertEquals("3",rows.get(1)[0]);assertEquals("2",rows.get(2)[0]);
        list.performItemClick(null,1,1);
        ShadowAlertDialog.getLatestAlertDialog().getListView().performItemClick(null,2,2);
        assertEquals(new HashSet<>(Arrays.asList("3")),hidden);
        SharedPreferences prefs=a.getSharedPreferences("editor-feedback",0);prefs.edit().clear().commit();
        CategoryOrder.save(prefs,"live",rows);prefs.edit().putStringSet(CategoryOrder.hiddenKey(prefs,"live"),hidden).commit();
        assertEquals("3",CategoryOrder.apply(rows,prefs.getString(CategoryOrder.key(prefs,"live"),"[]")).get(1)[0]);
        assertEquals(2,CategoryOrder.visible(rows,CategoryOrder.hidden(prefs,"live")).size());
    }
    @Test public void parentalPinCanBeSetWithRemotePadAndNoSystemKeyboard() throws Exception {
        MainActivity a=activity();call(a,"parentalControl");AlertDialog d=ShadowAlertDialog.getLatestAlertDialog();
        View decor=d.getWindow().getDecorView(); EditText e=entry(decor);assertNotNull(e);assertFalse(e.getShowSoftInputOnFocus());
        for(String digit:new String[]{"1","2","3","4"})button(decor,digit).performClick();
        button(decor,"OK").performClick();assertEquals("1234",a.getSharedPreferences("box-feedback",0).getString("pin",""));
    }
    @Test public void cancellingPinReplacementPreservesExistingProtection() throws Exception {
        MainActivity a=activity();SharedPreferences p=a.getSharedPreferences("box-feedback",0);p.edit().putString("pin","1234").commit();
        call(a,"parentalControl");ShadowAlertDialog.getLatestAlertDialog().getListView().performItemClick(null,1,1);
        AlertDialog d=ShadowAlertDialog.getLatestAlertDialog();View decor=d.getWindow().getDecorView();
        for(String digit:new String[]{"1","2","3","4"})button(decor,digit).performClick();
        button(decor,"OK").performClick();ShadowAlertDialog.getLatestAlertDialog().getButton(AlertDialog.BUTTON_NEGATIVE).performClick();
        assertEquals("1234",p.getString("pin",""));
    }
}