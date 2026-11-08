package uk.bmsupport.player;

import android.app.Activity;
import android.graphics.Bitmap;
import android.graphics.Canvas;
import android.view.KeyEvent;
import android.view.MotionEvent;
import android.view.View;
import java.util.Arrays;
import org.junit.Test;
import org.junit.runner.RunWith;
import org.robolectric.Robolectric;
import org.robolectric.RobolectricTestRunner;
import org.robolectric.annotation.Config;
import org.robolectric.annotation.GraphicsMode;
import static org.junit.Assert.*;

@RunWith(RobolectricTestRunner.class)
@Config(sdk=34, qualifiers="sw720dp-w1280dp-h720dp-land-mdpi")
@GraphicsMode(GraphicsMode.Mode.NATIVE)
public class GuideShortProgrammeTest {
    @Test public void fiveMinuteNewsAndWeatherRetainTheirActualReminderTimesAfterAxisExpansion() throws Exception {
        Activity a=Robolectric.buildActivity(Activity.class).setup().get();
        GuideGridView grid=new GuideGridView(a); a.setContentView(grid);
        grid.setChannels(Arrays.asList("BBC One | FHD", "BBC One | HD", "BBC One | SD", "BBC Two | FHD"), Arrays.asList(false,true,false,false));
        long start=System.currentTimeMillis()/1000/900*900;
        java.util.List<GuideGridView.Prog> shows=Arrays.asList(
                new GuideGridView.Prog("BBC Weekend News", start,start+900),
                new GuideGridView.Prog("BBC London News", start+900,start+1200),
                new GuideGridView.Prog("BBC Weather", start+1200,start+1500),
                new GuideGridView.Prog("Countryfile",start+1500,start+5100));
        for(int i=0;i<3;i++)grid.setProgs(i,shows);
        grid.setProgs(3,Arrays.asList(new GuideGridView.Prog("Match of the Day",start,start+5400)));
        grid.measure(View.MeasureSpec.makeMeasureSpec(1280,View.MeasureSpec.EXACTLY),View.MeasureSpec.makeMeasureSpec(340,View.MeasureSpec.EXACTLY));
        grid.layout(0,0,1280,340); grid.requestFocus();
        grid.onKeyDown(KeyEvent.KEYCODE_DPAD_RIGHT,new KeyEvent(KeyEvent.ACTION_DOWN,KeyEvent.KEYCODE_DPAD_RIGHT));
        assertEquals(start+900,grid.selected().st);
        assertEquals(start+1200,grid.selected().en);
        Bitmap image=Bitmap.createBitmap(1280,340,Bitmap.Config.ARGB_8888); grid.draw(new Canvas(image));
        String output=System.getProperty("guide.capture");
        if(output!=null)try(java.io.FileOutputStream file=new java.io.FileOutputStream(output)){image.compress(Bitmap.CompressFormat.PNG,100,file);}
        grid.onKeyDown(KeyEvent.KEYCODE_DPAD_RIGHT,new KeyEvent(KeyEvent.ACTION_DOWN,KeyEvent.KEYCODE_DPAD_RIGHT));
        assertEquals(start+1200,grid.selected().st);
        assertEquals(start+1500,grid.selected().en);
        grid.draw(new Canvas(image));
        java.lang.reflect.Method xAt=GuideGridView.class.getDeclaredMethod("xAt",long.class);xAt.setAccessible(true);
        float left=(float)xAt.invoke(grid,start+1200),right=(float)xAt.invoke(grid,start+1500);
        final GuideGridView.Prog[] picked={null};
        grid.setListener(new GuideGridView.Listener(){
            public void needEpg(int r){} public void onHighlight(int r,GuideGridView.Prog p){}
            public void onPick(int r,GuideGridView.Prog p){picked[0]=p;}
            public boolean hasReminder(int r,long t){return false;} public void onCatchup(int r){}
        });
        for(int action:new int[]{MotionEvent.ACTION_DOWN,MotionEvent.ACTION_UP}){
            MotionEvent e=MotionEvent.obtain(0,100,action,(left+right)/2,66,0);grid.onTouchEvent(e);e.recycle();
        }
        assertSame(shows.get(2),picked[0]);
    }
}